import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	QuantityUpdateDetails,
	SubscriptionUpdateInvoiceAction,
} from "../../typesOld";

/**
 * Aggregate invoice items and determine invoice creation strategy.
 * PURE FUNCTION - no side effects, only calculations.
 *
 * Extracted from:
 * - handleQuantityUpgrade.ts:79-164
 * - handleQuantityDowngrade.ts:78-165
 */
export const computeInvoiceAction = ({
	ctx,
	quantityUpdateDetails,
	stripeSubscription,
	stripeCustomerId,
	paymentMethod,
	shouldGenerateInvoiceOnly,
}: {
	ctx: AutumnContext;
	quantityUpdateDetails: QuantityUpdateDetails[];
	stripeSubscription: Stripe.Subscription;
	stripeCustomerId: string;
	paymentMethod?: Stripe.PaymentMethod;
	shouldGenerateInvoiceOnly?: boolean;
}): SubscriptionUpdateInvoiceAction | undefined => {
	if (stripeSubscription.status === "trialing") {
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
