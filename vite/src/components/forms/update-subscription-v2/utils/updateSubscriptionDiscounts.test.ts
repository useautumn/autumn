import { describe, expect, test } from "bun:test";
import { buildUpdateSubscriptionDiscounts } from "./updateSubscriptionDiscounts";
import { updateSubscriptionFormOverridesFromRequestBody } from "./updateSubscriptionFormOverridesFromRequestBody";

describe("buildUpdateSubscriptionDiscounts", () => {
	test("sends selected additions as discounts and marked rewards as remove_discounts", () => {
		expect(
			buildUpdateSubscriptionDiscounts({
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
		expect(
			buildUpdateSubscriptionDiscounts({
				discounts: [{ _id: "d1", reward_id: "" }],
				removedRewardIds: [],
			}),
		).toEqual({ discounts: undefined, remove_discounts: undefined });
	});
});

describe("updateSubscriptionFormOverridesFromRequestBody", () => {
	test("seeds new discount rows and marked removals from a request", () => {
		const overrides = updateSubscriptionFormOverridesFromRequestBody({
			discounts: [{ reward_id: "loyalty_10" }],
			remove_discounts: [{ reward_id: "launch_30" }],
		});

		expect(overrides.discounts).toEqual([
			{ _id: "seeded-discount-0", reward_id: "loyalty_10" },
		]);
		expect(overrides.removedRewardIds).toEqual(["launch_30"]);
	});
});
