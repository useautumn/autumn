import { describe, expect, test } from "bun:test";
import { planItemMatchesFilter } from "./planItemMatchesFilter.js";

const allowance = {
	feature_id: "credits",
	included: 10_000,
	reset: { interval: "month" },
	unlimited: false,
};
const usagePrice = {
	feature_id: "credits",
	included: 0,
	price: {
		billing_method: "usage_based",
		interval: "month",
	},
	reset: { interval: "month" },
	unlimited: false,
};

describe("planItemMatchesFilter — included", () => {
	test("included narrows to the item whose grant equals it", () => {
		const filter = { feature_id: "credits", included: 10_000 };
		expect(planItemMatchesFilter({ filter, item: allowance })).toBe(true);
		expect(planItemMatchesFilter({ filter, item: usagePrice })).toBe(false);
	});

	test("omitted included stays a wildcard", () => {
		const filter = { feature_id: "credits" };
		expect(planItemMatchesFilter({ filter, item: allowance })).toBe(true);
		expect(planItemMatchesFilter({ filter, item: usagePrice })).toBe(true);
	});

	test("an unlimited item never matches a numeric included", () => {
		expect(
			planItemMatchesFilter({
				filter: { feature_id: "credits", included: 0 },
				item: { feature_id: "credits", unlimited: true },
			}),
		).toBe(false);
	});

	test("an item without included matches included 0", () => {
		expect(
			planItemMatchesFilter({
				filter: { feature_id: "sso", included: 0 },
				item: { feature_id: "sso" },
			}),
		).toBe(true);
	});
});
