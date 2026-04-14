import {
	type StripeRefundAction,
	secondsToMs,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";

/** Build a Stripe refund action for refunding the latest invoice on cancellation */
export const buildStripeRefundAction = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}): StripeRefundAction | undefined => {
	if (!billingContext.refundLastPayment) return undefined;
	if (billingContext.cancelAction !== "cancel_immediately") return undefined;

	const { stripeSubscription } = billingContext;

	if (!stripeSubscription) return undefined;

	const periodInSeconds = subToPeriodStartEnd({ sub: stripeSubscription });

	return {
		type: "refund_last_invoice",
		stripeSubscriptionId: stripeSubscription.id,
		mode: billingContext.refundLastPayment,
		billingPeriod: {
			start: secondsToMs(periodInSeconds.start),
			end: secondsToMs(periodInSeconds.end),
		},
	};
};
