import type Stripe from "stripe";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext";
import { setupInvoiceFinalizedContext } from "./setupInvoiceFinalizedContext";
import { processVercelInvoice } from "./tasks/processVercelInvoice";
import { storeInvoiceLineItems } from "./tasks/storeInvoiceLineItems";
import { upsertAutumnInvoice } from "./tasks/upsertAutumnInvoice";

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
	await upsertAutumnInvoice({ ctx, eventContext });

	// 3. Store/reconcile invoice line items (async workflow)
	await storeInvoiceLineItems({ ctx, eventContext });
};
