import { describe, expect, test } from "bun:test";
import {
	buildUsagePriceCurrencies,
	fixedCurrenciesToApi,
	usageCurrenciesToTiers,
} from "./buildPriceCurrencies.js";

describe("fixedCurrenciesToApi", () => {
	test("returns undefined for missing/empty currencies", () => {
		expect(fixedCurrenciesToApi(undefined)).toBeUndefined();
		expect(fixedCurrenciesToApi({})).toBeUndefined();
	});

	test("maps per-currency amount blocks to flat additional_currencies", () => {
		expect(
			fixedCurrenciesToApi({ eur: { amount: 9 }, gbp: { amount: 8 } }),
		).toEqual([
			{ currency: "eur", amount: 9 },
			{ currency: "gbp", amount: 8 },
		]);
	});
});

describe("usageCurrenciesToTiers", () => {
	test("transposes per-currency usage_tiers to per-tier arrays", () => {
		expect(
			usageCurrenciesToTiers(
				{
					eur: {
						usage_tiers: [
							{ to: 500, amount: 0.4 },
							{ to: "inf", amount: 0.25 },
						],
					},
				},
				2,
			),
		).toEqual([
			[{ currency: "eur", amount: 0.4 }],
			[{ currency: "eur", amount: 0.25 }],
		]);
	});

	test("carries flat_amount", () => {
		expect(
			usageCurrenciesToTiers(
				{ eur: { usage_tiers: [{ to: "inf", amount: 0, flat_amount: 18 }] } },
				1,
			),
		).toEqual([[{ currency: "eur", amount: 0, flat_amount: 18 }]]);
	});

	test("returns undefined for missing/empty currencies", () => {
		expect(usageCurrenciesToTiers(undefined, 2)).toBeUndefined();
		expect(usageCurrenciesToTiers({}, 2)).toBeUndefined();
	});
});

describe("forward -> inverse round-trip", () => {
	test("tiered currencies survive build then read-back", () => {
		const baseTiers = [{ to: 500 }, { to: "inf" }] as const;
		const stored = buildUsagePriceCurrencies({
			baseTiers: [...baseTiers],
			itemTiers: [
				{ additional_currencies: [{ currency: "eur", amount: 0.4 }] },
				{ additional_currencies: [{ currency: "eur", amount: 0.25 }] },
			],
		});

		expect(usageCurrenciesToTiers(stored, baseTiers.length)).toEqual([
			[{ currency: "eur", amount: 0.4 }],
			[{ currency: "eur", amount: 0.25 }],
		]);
	});
});
