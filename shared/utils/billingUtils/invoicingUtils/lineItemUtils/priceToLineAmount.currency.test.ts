import { describe, expect, test } from "bun:test";
import "@autumn/shared";
import type { Price } from "../../../../models/productModels/priceModels/priceModels.js";
import { priceToLineAmount } from "./priceToLineAmount.js";

const fixedPrice = ({
	currencies,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: compact test fixtures
	currencies?: any;
}): Price =>
	({
		id: "price_fixed",
		tier_behavior: null,
		config: {
			type: "fixed",
			amount: 10,
			interval: "month",
			base_currency: "usd",
			currencies,
		},
	}) as unknown as Price;

const usagePrice = ({
	currencies,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: compact test fixtures
	currencies?: any;
}): Price =>
	({
		id: "price_usage",
		tier_behavior: null,
		config: {
			type: "usage",
			bill_when: "end_of_period",
			billing_units: 1,
			usage_tiers: [
				{ to: 100, amount: 0.1 },
				{ to: -1, amount: 0.08 },
			],
			interval: "month",
			base_currency: "usd",
			currencies,
		},
	}) as unknown as Price;

describe("priceToLineAmount per-currency", () => {
	test("fixed: eur reads the per-currency amount", () => {
		const price = fixedPrice({ currencies: { eur: { amount: 9 } } });
		expect(priceToLineAmount({ price, multiplier: 2, currency: "eur" })).toBe(
			18,
		);
		expect(priceToLineAmount({ price, multiplier: 2 })).toBe(20);
	});

	test("usage: eur reads per-currency tiers with base boundaries", () => {
		const price = usagePrice({
			currencies: {
				eur: {
					usage_tiers: [
						{ to: 100, amount: 0.09 },
						{ to: -1, amount: 0.07 },
					],
				},
			},
		});
		expect(priceToLineAmount({ price, overage: 150, currency: "eur" })).toBe(
			12.5,
		);
		expect(priceToLineAmount({ price, overage: 150 })).toBe(14);
	});

	test("legacy config (no base_currency / currencies): any currency reads base amounts", () => {
		const price = fixedPrice({});
		// biome-ignore lint/suspicious/noExplicitAny: strip stamped fields for legacy shape
		(price.config as any).base_currency = undefined;
		expect(priceToLineAmount({ price, currency: "usd" })).toBe(10);
		expect(priceToLineAmount({ price, currency: "eur" })).toBe(10);
	});
});
