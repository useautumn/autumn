import { describe, expect, test } from "bun:test";
import { updateSubscriptionFormOverridesFromRequestBody } from "./updateSubscriptionFormOverridesFromRequestBody";

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
