import { msToSeconds } from "@shared/utils";
import type Stripe from "stripe";
import type { StripeInvoiceAction } from "../../billingPlan";
import type { QuantityUpdateDetails } from "../../typesOld";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";

/**
 * Computes Stripe invoice action for quantity updates requiring proration.
 * Returns undefined if no invoice is needed or if finalize_invoice is false.
 */
export const computeStripeInvoiceAction = ({
	quantityUpdateDetails,
	updateSubscriptionContext,
	shouldFinalizeInvoice,
}: {
	quantityUpdateDetails: QuantityUpdateDetails[];
	updateSubscriptionContext: UpdateSubscriptionContext;
	shouldFinalizeInvoice: boolean;
}): StripeInvoiceAction | undefined => {
	const { stripeSubscription } = updateSubscriptionContext;

	const shouldComputeStripeInvoiceAction =
		shouldFinalizeInvoice && stripeSubscription?.latest_invoice;

	if (!shouldComputeStripeInvoiceAction) {
		return undefined;
	}

	const detailsRequiringProration = quantityUpdateDetails.filter(
		(
			detail,
		): detail is typeof detail & { calculatedProrationAmountDollars: number } =>
			detail.shouldApplyProration &&
			detail.calculatedProrationAmountDollars !== undefined,
	);

	if (detailsRequiringProration.length === 0) {
		return undefined;
	}

	const shouldChargeImmediately = quantityUpdateDetails.some(
		(detail) => detail.shouldFinalizeInvoiceImmediately,
	);

	if (!shouldChargeImmediately) {
		return undefined;
	}

	const lines: Stripe.InvoiceAddLinesParams.Line[] =
		detailsRequiringProration.map((detail) => ({
			description: detail.stripeInvoiceItemDescription,
			amount: Math.round(detail.calculatedProrationAmountDollars * 100),
			period: {
				start: msToSeconds(detail.subscriptionPeriodStartEpochMs),
				end: msToSeconds(detail.subscriptionPeriodEndEpochMs),
			},
		}));

	return { addLineParams: { lines } };
};
