import { expect } from "bun:test";
import type Stripe from "stripe";

/**
 * Asserts that two Stripe subscriptions are equivalent --
 * same items (price IDs + quantities) and billing_cycle_anchor.
 */
export const expectStripeSubscriptionUnchanged = ({
	before,
	after,
}: {
	before: Stripe.Subscription;
	after: Stripe.Subscription;
}) => {
	expect(
		after.billing_cycle_anchor,
		"billing_cycle_anchor should be unchanged",
	).toEqual(before.billing_cycle_anchor);

	expect(
		after.items.data.length,
		"subscription should have the same number of items",
	).toEqual(before.items.data.length);

	for (const beforeItem of before.items.data) {
		const afterItem = after.items.data.find(
			(i) => i.price.id === beforeItem.price.id,
		);
		expect(
			afterItem,
			`subscription item with price ${beforeItem.price.id} should still exist`,
		).toBeDefined();
		expect(
			afterItem!.quantity,
			`quantity for price ${beforeItem.price.id} should be unchanged`,
		).toEqual(beforeItem.quantity);
	}
};
