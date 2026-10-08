import { describe, expect, test } from "bun:test";
import { buildDiscountParams } from "./discountUtils";

describe("buildDiscountParams", () => {
	test("sends selected additions as discounts and marked rewards as remove_discounts", () => {
		expect(
			buildDiscountParams({
				discounts: [
					{ _id: "d1", reward_id: "loyalty_10" },
					{ _id: "d2", reward_id: "" },
				],
				removedRewardIds: ["launch_30"],
			}),
		).toEqual({
			discounts: [{ reward_id: "loyalty_10" }],
			remove_discounts: [{ reward_id: "launch_30" }],
		});
	});

	test("omits both params when nothing changed", () => {
		const params = buildDiscountParams({
			discounts: [{ _id: "d1", reward_id: "" }],
			removedRewardIds: [],
		});
		expect(params).toEqual({});
		expect(params).not.toHaveProperty("discounts");
		expect(params).not.toHaveProperty("remove_discounts");
	});

	test("never sends a discount outside the removable list, like a customer-level coupon", () => {
		expect(
			buildDiscountParams({
				discounts: [],
				removedRewardIds: ["customer_coupon", "launch_30"],
				removableRewardIds: ["launch_30"],
			}),
		).toEqual({ remove_discounts: [{ reward_id: "launch_30" }] });
		expect(
			buildDiscountParams({
				discounts: [],
				removedRewardIds: ["customer_coupon"],
				removableRewardIds: [],
			}),
		).toEqual({});
	});
});
