import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import {
	isStripeSubscriptionCanceled,
	isStripeSubscriptionTrialing,
} from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

export type ReplacementReason =
	| "paidBackdate"
	| "trialBackdate"
	| "trialing"
	| "paid"
	| "canceled"
	| "uncollected";

const UNCOLLECTED_STATUSES: Stripe.Subscription.Status[] = [
	"incomplete",
	"incomplete_expired",
	"unpaid",
	"paused",
];

export const replacementReason = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
}): ReplacementReason | undefined => {
	const { replacedStripeSubscription: replaced } = billingContext;
	if (!replaced) return undefined;
	if (isStripeSubscriptionCanceled(replaced)) return "canceled";
	if (UNCOLLECTED_STATUSES.includes(replaced.status)) return "uncollected";

	const trialing = isStripeSubscriptionTrialing(replaced);
	if (billingContext.subscriptionBackdateStartMs !== undefined) {
		return trialing ? "trialBackdate" : "paidBackdate";
	}
	return trialing ? "trialing" : "paid";
};

export const isBackdateReplacement = ({
	billingContext,
}: {
	billingContext: Parameters<typeof replacementReason>[0]["billingContext"];
}) => {
	const reason = replacementReason({ billingContext });
	return reason === "paidBackdate" || reason === "trialBackdate";
};
