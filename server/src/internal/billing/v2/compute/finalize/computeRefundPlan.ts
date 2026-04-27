import type {
	AutumnBillingPlan,
	LineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";

/**
 * Filters refund-direction line items out of the plan and computes
 * the refund amount (full or prorated) against the last invoice.
 */
export const computeRefundPlan = async ({
	ctx,
	billingContext,
	lineItems,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	lineItems: LineItem[];
}): Promise<{
	lineItems: LineItem[];
	refundPlan: AutumnBillingPlan["refundPlan"];
}> => {
	if (!billingContext.refundLastPayment) {
		return { lineItems, refundPlan: undefined };
	}

	const refundLineItems = lineItems.filter(
		(li) => li.context.direction === "refund",
	);
	const filteredLineItems = lineItems.filter(
		(li) => li.context.direction !== "refund",
	);

	const { stripeSubscription } = billingContext;
	if (!stripeSubscription) {
		return { lineItems: filteredLineItems, refundPlan: undefined };
	}

	const latestInvoiceId =
		typeof stripeSubscription.latest_invoice === "string"
			? stripeSubscription.latest_invoice
			: stripeSubscription.latest_invoice?.id;

	if (!latestInvoiceId) {
		return { lineItems: filteredLineItems, refundPlan: undefined };
	}

	const autumnInvoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: latestInvoiceId,
	});

	if (!autumnInvoice) {
		return { lineItems: filteredLineItems, refundPlan: undefined };
	}

	const invoiceTotal = Math.abs(autumnInvoice.total);
	const alreadyRefunded = autumnInvoice.refunded_amount ?? 0;
	const remainingRefundable = invoiceTotal - alreadyRefunded;

	let refundAmount: number;

	if (billingContext.refundLastPayment === "full") {
		refundAmount = remainingRefundable;
	} else {
		// Prorated: sum the refund line items (they're negative amounts representing credits)
		const proratedTotal = refundLineItems.reduce(
			(sum, li) => sum + (li.amount ?? 0),
			0,
		);
		const proratedAmount = proratedTotal < 0 ? Math.abs(proratedTotal) : 0;
		refundAmount = Math.min(proratedAmount, remainingRefundable);
	}

	return {
		lineItems: filteredLineItems,
		refundPlan: {
			amount: refundAmount,
			invoice: {
				stripe_id: autumnInvoice.stripe_id,
				total: autumnInvoice.total,
				current_refunded_amount: alreadyRefunded,
				currency: autumnInvoice.currency,
			},
		},
	};
};
