import { describe, expect, test } from "bun:test";
import type { SharedContext } from "../../../types/sharedContext";
import { attachItemCurrencies } from "./attachItemCurrencies.js";

// biome-ignore lint/suspicious/noExplicitAny: minimal ctx for a pure mapper test
const ctx = {
	org: { default_currency: "usd" },
	features: [],
} as any as SharedContext;

describe("attachItemCurrencies", () => {
	test("attaches flat additional_currencies + base_currency onto a flat item", () => {
		const result = attachItemCurrencies({
			ctx,
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			productItem: { feature_id: "seats", price: 10 } as any,
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			planItem: {
				feature_id: "seats",
				price: {
					amount: 10,
					interval: "month",
					billing_method: "prepaid",
					additional_currencies: [{ currency: "eur", amount: 9 }],
				},
			} as any,
		});

		expect(result.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
		expect(result.base_currency).toBe("usd");
	});

	test("attaches per-tier additional_currencies by index onto a tiered item", () => {
		const result = attachItemCurrencies({
			ctx,
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			productItem: {
				feature_id: "messages",
				tiers: [
					{ to: 500, amount: 0.5 },
					{ to: "inf", amount: 0.3 },
				],
			} as any,
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			planItem: {
				feature_id: "messages",
				price: {
					tiers: [
						{
							to: 600,
							amount: 0.5,
							additional_currencies: [{ currency: "eur", amount: 0.4 }],
						},
						{
							to: "inf",
							amount: 0.3,
							additional_currencies: [{ currency: "eur", amount: 0.25 }],
						},
					],
				},
			} as any,
		});

		expect(result.tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.4 },
		]);
		expect(result.tiers?.[1].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.25 },
		]);
		expect(result.base_currency).toBe("usd");
	});

	test("does not stamp base_currency when there are no additional currencies", () => {
		const result = attachItemCurrencies({
			ctx,
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			productItem: { feature_id: "x", price: 10 } as any,
			// biome-ignore lint/suspicious/noExplicitAny: test fixture
			planItem: {
				feature_id: "x",
				price: { amount: 10, interval: "month", billing_method: "prepaid" },
			} as any,
		});

		expect(result.base_currency).toBeUndefined();
		expect(result.additional_currencies).toBeUndefined();
	});

	test("rejects an additional currency equal to the base currency", () => {
		expect(() =>
			attachItemCurrencies({
				ctx,
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				productItem: { feature_id: "x", price: 10 } as any,
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				planItem: {
					feature_id: "x",
					price: {
						amount: 10,
						interval: "month",
						billing_method: "prepaid",
						additional_currencies: [{ currency: "USD", amount: 10 }],
					},
				} as any,
			}),
		).toThrow();
	});

	test("rejects a currency tier whose flat_amount shape differs from the base tier", () => {
		expect(() =>
			attachItemCurrencies({
				ctx,
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				productItem: {
					feature_id: "m",
					tiers: [{ to: "inf", amount: 0, flat_amount: 20 }],
				} as any,
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				planItem: {
					feature_id: "m",
					price: {
						tiers: [
							{
								to: "inf",
								flat_amount: 20,
								// base uses flat_amount; currency entry provides only amount
								additional_currencies: [{ currency: "eur", amount: 5 }],
							},
						],
					},
				} as any,
			}),
		).toThrow();
	});
});
