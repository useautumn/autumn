import { describe, expect, test } from "bun:test";
import {
	buildFixedPriceCurrencies,
	buildUsagePriceCurrencies,
} from "./buildPriceCurrencies.js";

describe("buildFixedPriceCurrencies", () => {
	test("returns undefined when there are no additional currencies", () => {
		expect(buildFixedPriceCurrencies(undefined)).toBeUndefined();
		expect(buildFixedPriceCurrencies([])).toBeUndefined();
	});

	test("maps each currency to a flat amount block", () => {
		expect(
			buildFixedPriceCurrencies([
				{ currency: "eur", amount: 9 },
				{ currency: "gbp", amount: 8 },
			]),
		).toEqual({ eur: { amount: 9 }, gbp: { amount: 8 } });
	});

	test("lowercases currency keys", () => {
		expect(buildFixedPriceCurrencies([{ currency: "EUR", amount: 9 }])).toEqual(
			{
				eur: { amount: 9 },
			},
		);
	});
});

describe("buildUsagePriceCurrencies (tiered)", () => {
	test("transposes per-tier amounts, copying boundaries from the base tiers", () => {
		const result = buildUsagePriceCurrencies({
			// base = subtracted internal tiers (boundaries source of truth)
			baseTiers: [{ to: 500 }, { to: "inf" }],
			itemTiers: [
				{ additional_currencies: [{ currency: "eur", amount: 0.4 }] },
				{ additional_currencies: [{ currency: "eur", amount: 0.25 }] },
			],
		});

		expect(result).toEqual({
			eur: {
				usage_tiers: [
					{ to: 500, amount: 0.4 },
					{ to: "inf", amount: 0.25 },
				],
			},
		});
	});

	test("carries per-currency flat_amount for volume tiers", () => {
		const result = buildUsagePriceCurrencies({
			baseTiers: [{ to: "inf" }],
			itemTiers: [
				{ additional_currencies: [{ currency: "eur", flat_amount: 18 }] },
			],
		});

		expect(result).toEqual({
			eur: { usage_tiers: [{ to: "inf", amount: 0, flat_amount: 18 }] },
		});
	});

	test("handles multiple currencies and lowercases keys", () => {
		const result = buildUsagePriceCurrencies({
			baseTiers: [{ to: "inf" }],
			itemTiers: [
				{
					additional_currencies: [
						{ currency: "EUR", amount: 0.4 },
						{ currency: "gbp", amount: 0.35 },
					],
				},
			],
		});

		expect(result).toEqual({
			eur: { usage_tiers: [{ to: "inf", amount: 0.4 }] },
			gbp: { usage_tiers: [{ to: "inf", amount: 0.35 }] },
		});
	});

	test("returns undefined when no tier carries a currency", () => {
		expect(
			buildUsagePriceCurrencies({
				baseTiers: [{ to: "inf" }],
				itemTiers: [{ additional_currencies: [] }],
			}),
		).toBeUndefined();
	});
});

describe("buildUsagePriceCurrencies (flat prepaid/usage)", () => {
	test("wraps a flat per-currency amount in a single base-boundary tier", () => {
		const result = buildUsagePriceCurrencies({
			baseTiers: [{ to: "inf" }],
			flatCurrencies: [{ currency: "eur", amount: 9 }],
		});

		expect(result).toEqual({
			eur: { usage_tiers: [{ to: "inf", amount: 9 }] },
		});
	});

	test("returns undefined when there are no flat currencies", () => {
		expect(
			buildUsagePriceCurrencies({ baseTiers: [{ to: "inf" }] }),
		).toBeUndefined();
	});
});
