import {
	type LineItem,
	LineItemSchema,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { ExpandedStripeInvoiceLineItem } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { stripeLineItemsToDbLineItems } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/index.js";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos/index.js";
import type { StoreInvoiceLineItemsPayload } from "@/queue/workflows.js";
import { fetchSubscriptionItemsInfo } from "./fetchSubscriptionItemsMetadata.js";

/**
 * Workflow handler that stores invoice line items from Stripe to the database.
 * Runs async via SQS to allow extra Stripe API calls for subscription item metadata.
 *
 * Two modes:
 * - Full upsert (default): Updates all columns. Used by invoice.created with full Autumn context.
 * - Reconcile only (reconcileOnly: true): Only updates Stripe-authoritative fields (amounts,
 *   quantities, discounts), preserving Autumn metadata. Used by invoice.finalized.
 *
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
	const { stripeInvoiceId, autumnInvoiceId, billingLineItems, reconcileOnly } =
		payload;

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

		// 2. Fetch subscription item info (metadata + isMetered flag)
		const subscriptionItemInfo = await fetchSubscriptionItemsInfo({
			stripeCli,
			stripeLineItems,
		});

		// 3. Filter out $0 metered placeholder line items
		// Stripe creates these as bookkeeping entries for usage-based prices with zero usage
		const filteredStripeLineItems = stripeLineItems.filter((li) => {
			if (li.amount !== 0) return true;
			if ((li.quantity ?? 0) !== 0) return true;

			const subItemId = li.parent?.subscription_item_details?.subscription_item;
			if (typeof subItemId !== "string") return true;

			const info = subscriptionItemInfo.get(subItemId);
			return !info?.isMetered;
		});

		// 4. Update deferred line items that were stored at billing time
		// When ProrateNextCycle creates pending invoice items, they're stored with
		// invoice_id=null. Now that they appear on a real invoice, update them.
		const remainingStripeLineItems = await updateDeferredLineItems({
			ctx,
			stripeLineItems: filteredStripeLineItems,
			autumnInvoiceId,
			stripeInvoiceId,
		});

		// 5. Parse billing line items if provided
		let autumnLineItems: LineItem[] | undefined;
		if (billingLineItems && billingLineItems.length > 0) {
			autumnLineItems = billingLineItems
				.map((item) => {
					const result = LineItemSchema.safeParse(item);
					return result.success ? result.data : null;
				})
				.filter((item): item is LineItem => item !== null);
		}

		// 6. Convert to DB format (extract metadata for matching)
		const subscriptionItemMetadata = new Map(
			Array.from(subscriptionItemInfo.entries()).map(([id, info]) => [
				id,
				info.metadata,
			]),
		);

		const dbLineItems = stripeLineItemsToDbLineItems({
			stripeLineItems: remainingStripeLineItems,
			invoiceId: autumnInvoiceId,
			stripeInvoiceId,
			autumnLineItems,
			subscriptionItemMetadata,
		});

		// 7. Write to DB
		if (dbLineItems.length > 0) {
			if (reconcileOnly) {
				// Reconcile mode: only update Stripe-authoritative fields, preserve Autumn metadata
				await invoiceLineItemRepo.reconcileMany({
					db,
					lineItems: dbLineItems,
				});
			} else {
				// Full upsert: update all columns (used when we have full Autumn context)
				await invoiceLineItemRepo.upsertMany({
					db,
					lineItems: dbLineItems,
				});
			}

			ctx.logger.info(
				`${reconcileOnly ? "Reconciled" : "Stored"} invoice line items`,
				{
					data2: dbLineItems.map((li) => ({
						id: li.id,
						stripe_id: li.stripe_id,
						feature_id: li.feature_id,
						amount: li.amount,
						direction: li.direction,
						total_quantity: li.total_quantity,
						paid_quantity: li.paid_quantity,
					})),
				},
			);
		}

		// 8. Delete stale line items (removed between invoice.created and invoice.finalized)
		// Use filtered list so we also delete $0 metered placeholders from DB
		const activeStripeIds = filteredStripeLineItems
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
		return;
	}
};

/**
 * Finds Stripe line items that originated from pending invoice items (deferred charges),
 * checks if we have pre-stored deferred DB rows for them, and updates those rows
 * with the real invoice info + new Stripe line item ID.
 *
 * Returns the Stripe line items that were NOT matched to deferred rows
 * (i.e., the ones that still need normal processing).
 */
const updateDeferredLineItems = async ({
	ctx,
	stripeLineItems,
	autumnInvoiceId,
	stripeInvoiceId,
}: {
	ctx: AutumnContext;
	stripeLineItems: ExpandedStripeInvoiceLineItem[];
	autumnInvoiceId: string;
	stripeInvoiceId: string;
}): Promise<ExpandedStripeInvoiceLineItem[]> => {
	// Collect invoice_item IDs from Stripe line items with invoice_item_details parent
	const invoiceItemMap = new Map<string, ExpandedStripeInvoiceLineItem>();
	for (const li of stripeLineItems) {
		const invoiceItemId = li.parent?.invoice_item_details?.invoice_item;
		if (typeof invoiceItemId === "string") {
			invoiceItemMap.set(invoiceItemId, li);
		}
	}

	if (invoiceItemMap.size === 0) {
		return stripeLineItems;
	}

	// Query DB for existing deferred rows
	let deferredRows: Awaited<
		ReturnType<typeof invoiceLineItemRepo.getDeferredByInvoiceItemIds>
	>;
	try {
		deferredRows = await invoiceLineItemRepo.getDeferredByInvoiceItemIds({
			db: ctx.db,
			stripeInvoiceItemIds: Array.from(invoiceItemMap.keys()),
		});
	} catch (error) {
		ctx.logger.error(
			`[storeInvoiceLineItems] Failed loading deferred rows for ${stripeInvoiceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		return stripeLineItems;
	}

	if (deferredRows.length === 0) {
		return stripeLineItems;
	}

	// Update each matched deferred row with invoice info
	const matchedInvoiceItemIds = new Set<string>();
	for (const row of deferredRows) {
		try {
			if (!row.stripe_invoice_item_id) continue;

			const stripeLineItem = invoiceItemMap.get(row.stripe_invoice_item_id);
			if (!stripeLineItem) continue;

			const amount = stripeToAtmnAmount({
				amount: stripeLineItem.amount,
				currency: stripeLineItem.currency,
			});
			const discountTotal = (stripeLineItem.discount_amounts ?? []).reduce(
				(sum, d) => sum + d.amount,
				0,
			);
			const amountAfterDiscounts = stripeToAtmnAmount({
				amount: stripeLineItem.amount - discountTotal,
				currency: stripeLineItem.currency,
			});

			await invoiceLineItemRepo.updateDeferredLineItem({
				db: ctx.db,
				id: row.id,
				updates: {
					invoice_id: autumnInvoiceId,
					stripe_invoice_id: stripeInvoiceId,
					stripe_id: stripeLineItem.id,
					amount,
					amount_after_discounts: amountAfterDiscounts,
					stripe_quantity: stripeLineItem.quantity ?? null,
				},
			});

			matchedInvoiceItemIds.add(row.stripe_invoice_item_id);
		} catch (error) {
			ctx.logger.error(
				`[storeInvoiceLineItems] Failed to update deferred line item ${row.id} for stripe invoice ${stripeInvoiceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	if (matchedInvoiceItemIds.size > 0) {
		ctx.logger.info(
			`[storeInvoiceLineItems] Updated ${matchedInvoiceItemIds.size} deferred line items with invoice ${stripeInvoiceId}`,
		);
	}

	// Return only the Stripe line items that were NOT matched to deferred rows
	return stripeLineItems.filter((li) => {
		const invoiceItemId = li.parent?.invoice_item_details?.invoice_item;
		if (typeof invoiceItemId !== "string") return true;
		return !matchedInvoiceItemIds.has(invoiceItemId);
	});
};
