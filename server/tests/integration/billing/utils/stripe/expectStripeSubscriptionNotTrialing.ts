import { expect } from "bun:test";
import type Stripe from "stripe";

export const expectStripeSubscriptionNotTrialing = ({
	subscription,
}: {
	subscription: Stripe.Subscription;
}) => {
	expect(
		subscription.status,
		`subscription ${subscription.id} should not be trialing`,
	).toBe("active");
	expect(
		subscription.trial_end,
		`subscription ${subscription.id} should have no trial_end`,
	).toBeNull();
};
