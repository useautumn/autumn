import { expect } from "bun:test";
import type Stripe from "stripe";

/** Validates that the subscription has exactly the expected reward coupon IDs. */
export const validateRewards = ({
	sub,
	rewards,
}: {
	sub: Stripe.Subscription;
	rewards: string[];
}) => {
	const subCouponIds =
		sub.discounts?.map((discount) => {
			if (typeof discount === "string") return discount;
			const d = discount as Stripe.Discount;
			return d.source?.coupon
				? typeof d.source.coupon === "string"
					? d.source.coupon
					: d.source.coupon.id
				: undefined;
		}) ?? [];

	for (const reward of rewards) {
		const found = subCouponIds.find((id) => id === reward);
		expect(found, `Expected reward coupon ${reward} on sub`).toBeDefined();
	}

	expect(subCouponIds.length).toBe(rewards.length);
};
