import type {
	AutumnBillingPlan,
	LineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { stripeToAtmnAmount } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";

type RefundInvoice = NonNullable<AutumnBillingPlan["refundPlan"]>["invoice"];

/**
 * Resolves the invoice the refund is issued against.
 *
 * Autumn's own row is preferred because it tracks how much was already
 * refunded. Subscriptions synced back from Stripe often have no mirrored row —
 * Autumn only stores invoices it received a webhook for, and sync never
 * backfills them — so fall back to reading the invoice from Stripe rather than
 * silently dropping the refund.
 */
const resolveRefundInvoice = async ({
	ctx,
	stripeInvoiceId,
}: {
	ctx: AutumnContext;
	stripeInvoiceId: string;
}): Promise<RefundInvoice | undefined> => {
	const autumnInvoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: stripeInvoiceId,
	});

	if (autumnInvoice) {
		return {
			stripe_id: autumnInvoice.stripe_id,
			total: autumnInvoice.total,
			current_refunded_amount: autumnInvoice.refunded_amount ?? 0,
			currency: autumnInvoice.currency,
		};
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeInvoice = await stripeCli.invoices.retrieve(stripeInvoiceId);

	// An unpaid invoice has no charge to refund against.
	if (stripeInvoice.status !== "paid") return undefined;

	ctx.logger.info(
		`[computeRefundPlan] No Autumn invoice for ${stripeInvoiceId}, falling back to the Stripe invoice`,
	);

	return {
		stripe_id: stripeInvoiceId,
		total: stripeToAtmnAmount({
			amount: stripeInvoice.total,
			currency: stripeInvoice.currency,
		}),
		// Without a mirrored row there is no Autumn-side refund history; the
		// charge's already-refunded amount is applied when the refund action is
		// built, so the refund is still capped at what Stripe will allow.
		current_refunded_amount: 0,
		currency: stripeInvoice.currency,
	};
};

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

	const refundInvoice = await resolveRefundInvoice({
		ctx,
		stripeInvoiceId: latestInvoiceId,
	});

	if (!refundInvoice) {
		return { lineItems: filteredLineItems, refundPlan: undefined };
	}

	const invoiceTotal = Math.abs(refundInvoice.total);
	const alreadyRefunded = refundInvoice.current_refunded_amount;
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
			invoice: refundInvoice,
		},
	};
};
