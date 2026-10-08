import type { BillingContext } from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

/** The request removes the trial the live Stripe subscription runs, whether it is updated or replaced. */
export const endsLiveTrial = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"stripeSubscription" | "replacedStripeSubscription" | "trialContext"
	>;
}) =>
	isStripeSubscriptionTrialing(
		billingContext.stripeSubscription ??
			billingContext.replacedStripeSubscription,
	) && billingContext.trialContext?.trialEndsAt === null;
