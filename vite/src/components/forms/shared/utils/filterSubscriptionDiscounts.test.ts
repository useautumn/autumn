import { describe, expect, test } from "bun:test";
import {
	type ApiDiscount,
	CouponDurationType,
	RewardType,
} from "@autumn/shared";
import { filterSubscriptionDiscounts } from "./filterSubscriptionDiscounts";

const discount = (id: string, subscription_id?: string): ApiDiscount => ({
	id,
	name: id,
	type: RewardType.PercentageDiscount,
	discount_value: 10,
	duration_type: CouponDurationType.Forever,
	subscription_id,
});

describe("filterSubscriptionDiscounts", () => {
	test("keeps the subscription's discounts and hides customer-level coupons", () => {
		expect(
			filterSubscriptionDiscounts({
				discounts: [
					discount("launch", "sub_1"),
					discount("customer_coupon"),
					discount("other_sub", "sub_2"),
				],
				subscriptionIds: ["sub_1"],
			}).map(({ id }) => id),
		).toEqual(["launch"]);
	});
});
