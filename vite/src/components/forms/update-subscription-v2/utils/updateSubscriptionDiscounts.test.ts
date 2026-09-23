import { describe, expect, test } from "bun:test";
import {
	buildUpdateSubscriptionDiscounts,
	splitUpdateSubscriptionDiscounts,
} from "./updateSubscriptionDiscounts";

describe("buildUpdateSubscriptionDiscounts", () => {
	test("sends selected additions and marked removals with explicit actions", () => {
		expect(
			buildUpdateSubscriptionDiscounts({
				discounts: [
					{ _id: "d1", reward_id: "loyalty_10" },
					{ _id: "d2", reward_id: "" },
				],
				removedRewardIds: ["launch_30"],
			}),
		).toEqual([
			{ action: "add", reward_id: "loyalty_10" },
			{ action: "remove", reward_id: "launch_30" },
		]);
	});

	test("omits the param when nothing changed", () => {
		expect(
			buildUpdateSubscriptionDiscounts({
				discounts: [{ _id: "d1", reward_id: "" }],
				removedRewardIds: [],
			}),
		).toBeUndefined();
	});
});

describe("splitUpdateSubscriptionDiscounts", () => {
	test("seeds additions as rows and removals as marked rewards", () => {
		expect(
			splitUpdateSubscriptionDiscounts([
				{ reward_id: "loyalty_10" },
				{ action: "remove", reward_id: "launch_30" },
			]),
		).toEqual({
			discounts: [{ _id: "seeded-discount-0", reward_id: "loyalty_10" }],
			removedRewardIds: ["launch_30"],
		});
	});
});
