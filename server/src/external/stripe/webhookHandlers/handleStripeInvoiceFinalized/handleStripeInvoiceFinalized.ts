import type Stripe from "stripe";
import { storeRenewalLineItems } from "@/external/stripe/webhookHandlers/common";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { setupInvoiceFinalizedContext } from "./setupInvoiceFinalizedContext";
import { processVercelInvoice } from "./tasks/processVercelInvoice";

/**
 * Handles invoice.finalized webhook.
 *
 * For regular invoices: Creates/updates Autumn invoice records and stores line items.
 * For Vercel custom payment method invoices: Submits invoice to Vercel marketplace for payment processing.
 */
export const handleStripeInvoiceFinalized = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoiceFinalizedEvent;
}) => {
	const eventContext = await setupInvoiceFinalizedContext({ ctx, event });

	if (!eventContext) {
		ctx.logger.debug("[invoice.finalized] Skipping - context not found");
		return;
	}

	ctx.logger.info(
		`[invoice.finalized] Processing for invoice ${eventContext.stripeInvoice.id}`,
	);

	// 1. Handle Vercel custom payment method invoices
	await processVercelInvoice({ ctx, eventContext });

	// 2. Upsert Autumn invoice record
	// 2. Try to update existing invoice first (works even without subscription)
	const autumnInvoice = await InvoiceService.updateFromStripeInvoice({
		db: ctx.db,
		stripeInvoice: eventContext.stripeInvoice,
	});

	// 3. Reconcile invoice line items (async workflow)
	// Uses reconcileOnly mode to only update Stripe-authoritative fields (amounts,
	// quantities, discounts), preserving Autumn metadata set during invoice.created.
	if (autumnInvoice) {
		await storeRenewalLineItems({
			ctx,
			autumnInvoice,
			stripeInvoiceId: eventContext.stripeInvoice.id,
			arrearLineItems: [],
			reconcileOnly: true,
		});
	}
};
