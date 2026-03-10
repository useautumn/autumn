import type { Invoice, LineItem } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import { workflows } from "@/queue/workflows";
import {
	type BaseWebhookEventContext,
	buildBillingContextForInAdvanceInvoice,
} from "./buildBillingContextFromWebhook";

/**
 * Generates billing line items and triggers the async workflow to store them.
 *
 * For invoice.created: Pass eventContext and periodEndMs to generate both
 * in-advance and arrear line items with full Autumn metadata.
 *
 * For invoice.finalized: Pass reconcileOnly: true to only update Stripe-authoritative
 * fields (amounts, quantities), preserving Autumn metadata set during invoice.created.
 */
export async function storeRenewalLineItems({
	ctx,
	autumnInvoice,
	stripeInvoiceId,
	arrearLineItems,
	eventContext,
	periodEndMs,
	reconcileOnly,
}: {
	ctx: StripeWebhookContext;
	autumnInvoice: Invoice;
	stripeInvoiceId: string;
	arrearLineItems: LineItem[];
	eventContext?: BaseWebhookEventContext;
	periodEndMs?: number;
	reconcileOnly?: boolean;
}): Promise<void> {
	const { org, env, logger } = ctx;

	const billingLineItems: LineItem[] = [];

	// Generate in-advance line items if we have full context
	if (eventContext && periodEndMs) {
		const billingContext = buildBillingContextForInAdvanceInvoice({
			eventContext,
			periodEndMs,
		});

		for (const cusProduct of eventContext.customerProducts) {
			const productLineItems = customerProductToLineItems({
				ctx,
				customerProduct: cusProduct,
				billingContext,
				direction: "charge",
			});
			billingLineItems.push(...productLineItems);
		}
	}

	// Append arrear line items (already generated before balance reset)
	billingLineItems.push(...arrearLineItems);

	await workflows.triggerStoreInvoiceLineItems({
		orgId: org.id,
		env,
		stripeInvoiceId,
		autumnInvoiceId: autumnInvoice.id,
		billingLineItems,
		reconcileOnly,
	});

	logger.info(
		`[storeRenewalLineItems] Triggered workflow for ${stripeInvoiceId}`,
	);
}
