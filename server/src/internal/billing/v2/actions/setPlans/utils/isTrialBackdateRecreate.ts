import type { BillingContext } from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

/** A trialing subscription is being recreated from a backdated start, keeping its trial or ending it per the request. */
export const isTrialBackdateRecreate = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
}) =>
	billingContext.subscriptionBackdateStartMs !== undefined &&
	isStripeSubscriptionTrialing(billingContext.replacedStripeSubscription);
