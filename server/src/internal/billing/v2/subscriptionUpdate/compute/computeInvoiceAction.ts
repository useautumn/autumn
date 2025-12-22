import type Stripe from "stripe";
import type {
	QuantityUpdateDetails,
	SubscriptionUpdateInvoiceAction,
} from "../../typesOld";

/**
 * Computes invoice action for quantity updates requiring proration.
 *
 * Filters details with proration, creates invoice items, and determines charge timing.
 *
 * @param quantityUpdateDetails - Array of quantity update details
 * @param stripeSubscription - Stripe subscription being updated
 * @param paymentMethod - Optional payment method for immediate charges
 * @param shouldGenerateInvoiceOnly - If true, skip immediate charge
 * @returns Invoice action with items and charge strategy, or undefined if no invoice needed
 */
export const computeInvoiceAction = ({
	quantityUpdateDetails,
	stripeSubscription,
	paymentMethod,
	shouldGenerateInvoiceOnly,
}: {
	quantityUpdateDetails: QuantityUpdateDetails[];
	stripeSubscription: Stripe.Subscription;
	paymentMethod?: Stripe.PaymentMethod;
	shouldGenerateInvoiceOnly?: boolean;
}): SubscriptionUpdateInvoiceAction | undefined => {
	const invoiceExists = stripeSubscription.latest_invoice !== null;
	if (!invoiceExists) {
		return undefined;
	}

	const detailsRequiringInvoiceItems = quantityUpdateDetails.filter(
		(
			detail,
		): detail is typeof detail & { calculatedProrationAmountDollars: number } =>
			detail.shouldApplyProration &&
			detail.calculatedProrationAmountDollars !== undefined,
	);

	if (detailsRequiringInvoiceItems.length === 0) {
		return undefined;
	}

	const invoiceItems = detailsRequiringInvoiceItems.map((detail) => ({
		description: detail.stripeInvoiceItemDescription,
		amountDollars: detail.calculatedProrationAmountDollars,
		stripePriceId: detail.stripePriceId,
		periodStartEpochMs: detail.subscriptionPeriodStartEpochMs,
		periodEndEpochMs: detail.subscriptionPeriodEndEpochMs,
	}));

	const shouldChargeImmediately = quantityUpdateDetails.some(
		(detail) => detail.shouldFinalizeInvoiceImmediately,
	);

	const customerPrices = quantityUpdateDetails.map(
		(detail) => detail.customerPrice,
	);

	return {
		shouldCreateInvoice: true,
		invoiceItems,
		shouldChargeImmediately:
			shouldChargeImmediately && !shouldGenerateInvoiceOnly,
		paymentMethod,
		customerPrices,
	};
};
