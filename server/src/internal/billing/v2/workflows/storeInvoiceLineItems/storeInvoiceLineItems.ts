import { type LineItem, LineItemSchema } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { stripeLineItemsToDbLineItems } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/index.js";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos/index.js";
import type { StoreInvoiceLineItemsPayload } from "@/queue/workflows.js";
import { fetchSubscriptionItemsMetadata } from "./fetchSubscriptionItemsMetadata.js";

/**
 * Workflow handler that stores invoice line items from Stripe to the database.
 * Runs async via SQS to allow extra Stripe API calls for subscription item metadata.
 *
 * Uses upsert semantics: items with a stripe_id are upserted (insert or update),
 * allowing reconciliation between invoice.created and invoice.finalized.
 * Also deletes stale line items that no longer exist in Stripe.
 */
export const storeInvoiceLineItems = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: StoreInvoiceLineItemsPayload;
}): Promise<void> => {
	const { db, org, env } = ctx;
	const { stripeInvoiceId, autumnInvoiceId, billingLineItems } = payload;

	try {
		const stripeCli = createStripeCli({ org, env });

		// 1. Fetch invoice line items from Stripe
		const stripeLineItems = await getStripeInvoiceLineItems({
			stripeClient: stripeCli,
			invoiceId: stripeInvoiceId,
		});

		if (stripeLineItems.length === 0) {
			ctx.logger.debug(
				`[storeInvoiceLineItems] No line items found for ${stripeInvoiceId}`,
			);
			// Still need to delete any stale items (invoice might have been emptied)
			await invoiceLineItemRepo.deleteStaleByStripeInvoiceId({
				db,
				stripeInvoiceId,
				activeStripeIds: [],
			});
			return;
		}

		// 2. Fetch subscription item metadata for line items that need it
		const subscriptionItemMetadata = await fetchSubscriptionItemsMetadata({
			stripeCli,
			stripeLineItems,
		});

		// 3. Parse billing line items if provided
		let autumnLineItems: LineItem[] | undefined;
		if (billingLineItems && billingLineItems.length > 0) {
			autumnLineItems = billingLineItems
				.map((item) => {
					const result = LineItemSchema.safeParse(item);
					return result.success ? result.data : null;
				})
				.filter((item): item is LineItem => item !== null);
		}

		// 4. Convert to DB format
		const dbLineItems = stripeLineItemsToDbLineItems({
			stripeLineItems,
			invoiceId: autumnInvoiceId,
			stripeInvoiceId,
			autumnLineItems,
			subscriptionItemMetadata,
		});

		// 5. Upsert into DB (insert or update by stripe_id)
		if (dbLineItems.length > 0) {
			await invoiceLineItemRepo.upsertMany({
				db,
				lineItems: dbLineItems,
			});

			ctx.logger.info(`Stored invoice line items`, {
				data2: dbLineItems.map((li) => ({
					id: li.id,
					stripe_id: li.stripe_id,
					feature_id: li.feature_id,
					amount: li.amount,
					direction: li.direction,
					total_quantity: li.total_quantity,
					paid_quantity: li.paid_quantity,
				})),
			});
		}

		// 6. Delete stale line items (removed between invoice.created and invoice.finalized)
		const activeStripeIds = stripeLineItems
			.map((li) => li.id)
			.filter((id): id is string => id != null);

		await invoiceLineItemRepo.deleteStaleByStripeInvoiceId({
			db,
			stripeInvoiceId,
			activeStripeIds,
		});
	} catch (error) {
		ctx.logger.error(
			`[storeInvoiceLineItems] Failed for ${stripeInvoiceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		throw error;
	}
};
