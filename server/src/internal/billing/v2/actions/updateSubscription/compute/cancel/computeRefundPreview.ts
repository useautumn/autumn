import type {
	BillingPreviewResponse,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";

/** Compute refund preview when refund_last_payment is set */
export const computeRefundPreview = async ({
	ctx,
	billingContext,
	previewTotal,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	previewTotal: number;
}): Promise<BillingPreviewResponse["refund"]> => {
	if (!billingContext.refundLastPayment) return undefined;

	const { stripeSubscription } = billingContext;
	if (!stripeSubscription) return undefined;

	// Get the latest invoice stripe_id from the subscription
	const latestInvoiceId =
		typeof stripeSubscription.latest_invoice === "string"
			? stripeSubscription.latest_invoice
			: stripeSubscription.latest_invoice?.id;

	if (!latestInvoiceId) return undefined;

	// Look up the Autumn invoice to get refunded_amount
	const autumnInvoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: latestInvoiceId,
	});

	if (!autumnInvoice) return undefined;

	const invoiceTotal = Math.abs(autumnInvoice.total);
	const alreadyRefunded = autumnInvoice.refunded_amount ?? 0;
	const remainingRefundable = invoiceTotal - alreadyRefunded;

	// For full: refund whatever remains
	// For prorated: use the prorated amount from line items total (capped at remaining)
	let refundAmount: number;

	if (billingContext.refundLastPayment === "full") {
		refundAmount = remainingRefundable;
	} else {
		// Prorated: the line items total is a negative number representing the prorated credit
		const proratedAmount = Math.abs(previewTotal);
		refundAmount = Math.min(proratedAmount, remainingRefundable);
	}

	return {
		amount: refundAmount,
		invoice: {
			stripe_id: autumnInvoice.stripe_id,
			total: autumnInvoice.total,
			refunded_amount: alreadyRefunded,
			currency: autumnInvoice.currency,
		},
	};
};
