import { secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";

/** When the replaced subscription's paid period ends; undefined when it has no items to say. */
export const replacedSubscriptionPeriodEndMs = ({
	replacedStripeSubscription,
}: {
	replacedStripeSubscription?: Stripe.Subscription;
}) => {
	if (!replacedStripeSubscription?.items.data.length) return undefined;
	return secondsToMs(getLatestPeriodEnd({ sub: replacedStripeSubscription }));
};
