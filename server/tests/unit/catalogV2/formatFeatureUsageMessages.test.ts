import { describe, expect, test } from "bun:test";
import { emptyCatalogFeatureUsage } from "@autumn/shared";
import { formatFeatureUsageMessages } from "@/internal/catalogV2/actions/updateCatalog/preview/featureUsage/formatFeatureUsageMessages";

describe("formatFeatureUsageMessages", () => {
	test("empty usage → no reasons", () => {
		expect(
			formatFeatureUsageMessages({ usage: emptyCatalogFeatureUsage() }),
		).toEqual([]);
	});

	test("one plan with sample", () => {
		expect(
			formatFeatureUsageMessages({
				usage: {
					...emptyCatalogFeatureUsage(),
					plans: {
						count: 1,
						count_capped: false,
						samples: [{ id: "free", name: "Free" }],
					},
				},
			}),
		).toEqual([{ message: 'Plan "Free" is using this feature.' }]);
	});

	test("many plans with sample", () => {
		expect(
			formatFeatureUsageMessages({
				usage: {
					...emptyCatalogFeatureUsage(),
					plans: {
						count: 102,
						count_capped: false,
						samples: [{ id: "free", name: "Free" }],
					},
				},
			}),
		).toEqual([
			{ message: 'Plans "Free" and 101 other plans are using this feature.' },
		]);
	});

	test("capped plan count", () => {
		expect(
			formatFeatureUsageMessages({
				usage: {
					...emptyCatalogFeatureUsage(),
					plans: {
						count: 10_000,
						count_capped: true,
						samples: [{ id: "free", name: "Free" }],
					},
				},
			}),
		).toEqual([
			{
				message:
					'Plans "Free" and 10,000+ others are using this feature.',
			},
		]);
	});

	test("credit system + capped customers without samples", () => {
		expect(
			formatFeatureUsageMessages({
				usage: {
					plans: emptyCatalogFeatureUsage().plans,
					credit_systems: {
						count: 1,
						count_capped: false,
						samples: [{ id: "credits", name: "credits" }],
					},
					customers: {
						count: 10_000,
						count_capped: true,
						samples: [],
					},
				},
			}),
		).toEqual([
			{ message: 'Credit system "credits" references this feature.' },
			{ message: "Attached to 10,000+ customers." },
		]);
	});

	test("one customer with sample", () => {
		expect(
			formatFeatureUsageMessages({
				usage: {
					...emptyCatalogFeatureUsage(),
					customers: {
						count: 1,
						count_capped: false,
						samples: [{ id: "cus_1", name: "Alice" }],
					},
				},
			}),
		).toEqual([{ message: 'Attached to customer "Alice".' }]);
	});

	test("two customers with sample", () => {
		expect(
			formatFeatureUsageMessages({
				usage: {
					...emptyCatalogFeatureUsage(),
					customers: {
						count: 2,
						count_capped: false,
						samples: [{ id: "cus_1", name: "Alice" }],
					},
				},
			}),
		).toEqual([{ message: 'Attached to customer "Alice" and 1 more.' }]);
	});

	test("capped customers with sample", () => {
		expect(
			formatFeatureUsageMessages({
				usage: {
					...emptyCatalogFeatureUsage(),
					customers: {
						count: 3,
						count_capped: true,
						samples: [{ id: "cus_1", name: "Alice" }],
					},
				},
			}),
		).toEqual([{ message: 'Attached to customer "Alice" and 3+ more.' }]);
	});
});
