import { expect } from "bun:test";
import { getStripeSubscription } from "./discountTestUtils.js";

/**
 * Asserts the customer's Stripe subscription carries exactly these coupons, in any order.
 */
export const expectSubscriptionDiscountsCorrect = async ({
	customerId,
	couponIds,
}: {
	customerId: string;
	couponIds: string[];
}) => {
	const { subscription } = await getStripeSubscription({
		customerId,
		expand: ["data.discounts.source.coupon"],
	});

	const appliedCouponIds = (subscription.discounts ?? []).map((discount) => {
		if (typeof discount === "string") return discount;
		const coupon = discount.source?.coupon;
		return typeof coupon === "string" ? coupon : coupon?.id;
	});

	expect(
		[...appliedCouponIds].sort(),
		`Stripe subscription ${subscription.id} discounts`,
	).toEqual([...couponIds].sort());
};
