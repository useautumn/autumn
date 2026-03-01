import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { workflows } from "@/queue/workflows";
import type { InvoiceFinalizedContext } from "../setupInvoiceFinalizedContext";

/**
 * Triggers async workflow to store/reconcile invoice line items.
 *
 * For invoice.finalized, we pass an empty billingLineItems array because:
 * 1. The rich Autumn metadata (feature_id, proration info, etc.) was already captured at invoice.created
 * 2. This handler is mainly for reconciliation: upserting Stripe line items and deleting stale ones
 * 3. We don't have fresh arrear data (balances were reset at invoice.created)
 *
 * The workflow will still fetch current Stripe line items and upsert/delete as needed.
 */
export const storeInvoiceLineItems = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceFinalizedContext;
}): Promise<void> => {
	const { db, org, env, logger } = ctx;
	const { stripeInvoice } = eventContext;

	// Get Autumn invoice
	const autumnInvoice = await InvoiceService.getByStripeId({
		db,
		stripeId: stripeInvoice.id,
	});

	if (!autumnInvoice) {
		logger.debug(
			`[invoice.finalized] No Autumn invoice found for ${stripeInvoice.id}, skipping line items`,
		);
		return;
	}

	// Trigger workflow with empty billingLineItems - see JSDoc for why
	await workflows.triggerStoreInvoiceLineItems({
		orgId: org.id,
		env,
		stripeInvoiceId: stripeInvoice.id,
		autumnInvoiceId: autumnInvoice.id,
		billingLineItems: [],
	});

	logger.info(
		`[invoice.finalized] Triggered storeInvoiceLineItems workflow for ${stripeInvoice.id}`,
	);
};
