import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { storeLineItems } from "@/internal/invoices/lineItems/actions/storeLineItems.js";
import { sendInvoiceFinalizedWebhook } from "@/internal/invoices/webhooks/sendInvoiceFinalizedWebhook.js";
import type { StoreInvoiceLineItemsPayload } from "@/queue/workflows.js";

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
	const {
		stripeInvoiceId,
		autumnInvoiceId,
		billingLineItems,
		reconcileOnly,
		emitFinalizedWebhook,
	} = payload;

	try {
		await storeLineItems({
			ctx,
			stripeInvoiceId,
			autumnInvoiceId,
			billingLineItems,
			reconcileOnly,
		});
	} catch (error) {
		ctx.logger.error(
			`[storeInvoiceLineItems] Failed for ${stripeInvoiceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		// A swallowed failure would permanently lose the finalized event; let SQS retry
		if (emitFinalizedWebhook) throw error;
		return;
	}

	// Emit even when storage found no lines: consumers need every finalized invoice
	if (emitFinalizedWebhook) {
		await sendInvoiceFinalizedWebhook({ ctx, autumnInvoiceId });
	}
};
