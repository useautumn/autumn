/**
 * The set_plans preview lists the current discounts: only the customer's own coupon loses its subscription,
 * so a replaced subscription coupon (whose discount has no id) stays on the subscription and removable.
 */

import { describe, expect, test } from "bun:test";
import type { StripeDiscountWithCoupon } from "@autumn/shared";
import type Stripe from "stripe";
import { previewSubscriptionDiscounts } from "@/internal/billing/v2/actions/setPlans/preview/previewSubscriptionDiscounts";

const SUBSCRIPTION = { id: "sub_live" } as Stripe.Subscription;

const discount = ({
	id,
	couponId,
}: {
	id?: string;
	couponId: string;
}): StripeDiscountWithCoupon => ({
	id,
	source: {
		coupon: {
			id: couponId,
			name: couponId,
			percent_off: 20,
			duration: "forever",
			valid: true,
		} as Stripe.Coupon,
	},
});

const preview = ({
	discounts,
	customerDiscountId,
}: {
	discounts: StripeDiscountWithCoupon[];
	customerDiscountId: string | undefined;
}) =>
	previewSubscriptionDiscounts({
		discounts,
		customerDiscountId,
		subscription: SUBSCRIPTION,
		currentEpochMs: Date.UTC(2026, 9, 8),
	});

describe("previewSubscriptionDiscounts", () => {
	test("a replaced subscription coupon with no customer coupon keeps its subscription", () => {
		const [replaced] = preview({
			discounts: [discount({ couponId: "co_launch" })],
			customerDiscountId: undefined,
		});

		expect(replaced?.subscription_id).toBe("sub_live");
	});

	test("only the customer's own coupon loses its subscription", () => {
		const listed = preview({
			discounts: [
				discount({ id: "di_sub", couponId: "co_launch" }),
				discount({ id: "di_customer", couponId: "co_customer" }),
			],
			customerDiscountId: "di_customer",
		});

		expect(listed.map((d) => [d.id, d.subscription_id ?? null])).toEqual([
			["co_launch", "sub_live"],
			["co_customer", null],
		]);
	});
});
