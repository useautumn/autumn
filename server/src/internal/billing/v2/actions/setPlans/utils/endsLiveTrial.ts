import type { BillingContext } from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

/** The request removes the trial the live Stripe subscription is running. */
export const endsLiveTrial = ({
	billingContext,
}: {
	billingContext: Pick<BillingContext, "stripeSubscription" | "trialContext">;
}) =>
	isStripeSubscriptionTrialing(billingContext.stripeSubscription) &&
	billingContext.trialContext?.trialEndsAt === null;
