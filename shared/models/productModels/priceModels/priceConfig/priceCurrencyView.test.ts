import { describe, expect, test } from "bun:test";
import {
	type CurrencyAwarePriceConfig,
	getPriceCurrencyStripeId,
	isBaseCurrency,
	priceConfigForCurrency,
	priceHasCurrencyAmounts,
	setPriceCurrencyStripeId,
} from "./priceCurrencyView.js";

const fixedConfig = {
	type: "fixed",
	amount: 10,
	interval: "month",
	base_currency: "usd",
	currencies: {
		eur: { amount: 9, stripe_price_id: "price_eur" },
	},
};

const usageConfig = {
	type: "usage",
	usage_tiers: [{ to: "inf", amount: 0.5 }],
	base_currency: "usd",
	currencies: {
		eur: { usage_tiers: [{ to: "inf", amount: 0.4 }] },
	},
};

describe("isBaseCurrency", () => {
	test("true when currency matches config.base_currency (case-insensitive)", () => {
		expect(
			isBaseCurrency({
				config: fixedConfig,
				currency: "USD",
				orgDefault: "usd",
			}),
		).toBe(true);
	});

	test("false for a non-base currency", () => {
		expect(
			isBaseCurrency({
				config: fixedConfig,
				currency: "eur",
				orgDefault: "usd",
			}),
		).toBe(false);
	});

	test("falls back to orgDefault when base_currency is absent", () => {
		const noBase = { amount: 10 };
		expect(
			isBaseCurrency({ config: noBase, currency: "usd", orgDefault: "usd" }),
		).toBe(true);
		expect(
			isBaseCurrency({ config: noBase, currency: "eur", orgDefault: "usd" }),
		).toBe(false);
	});
});

describe("priceConfigForCurrency", () => {
	test("returns the top-level amount for the base currency", () => {
		expect(
			priceConfigForCurrency({
				config: fixedConfig,
				currency: "usd",
				orgDefault: "usd",
			}).amount,
		).toBe(10);
	});

	test("returns the per-currency block amount for a non-base currency", () => {
		expect(
			priceConfigForCurrency({
				config: fixedConfig,
				currency: "eur",
				orgDefault: "usd",
			}).amount,
		).toBe(9);
	});

	test("returns base vs per-currency usage_tiers for a usage config", () => {
		expect(
			priceConfigForCurrency({
				config: usageConfig,
				currency: "usd",
				orgDefault: "usd",
			}).usage_tiers?.[0].amount,
		).toBe(0.5);
		expect(
			priceConfigForCurrency({
				config: usageConfig,
				currency: "eur",
				orgDefault: "usd",
			}).usage_tiers?.[0].amount,
		).toBe(0.4);
	});
});

describe("getPriceCurrencyStripeId", () => {
	test("reads the top-level slot for the base currency", () => {
		const config = { ...fixedConfig, stripe_price_id: "price_usd" };
		expect(
			getPriceCurrencyStripeId({
				config,
				currency: "usd",
				orgDefault: "usd",
				slot: "stripe_price_id",
			}),
		).toBe("price_usd");
	});

	test("reads the per-currency slot for a non-base currency", () => {
		expect(
			getPriceCurrencyStripeId({
				config: fixedConfig,
				currency: "eur",
				orgDefault: "usd",
				slot: "stripe_price_id",
			}),
		).toBe("price_eur");
	});

	test("undefined when the per-currency slot is unset", () => {
		expect(
			getPriceCurrencyStripeId({
				config: fixedConfig,
				currency: "gbp",
				orgDefault: "usd",
				slot: "stripe_price_id",
			}),
		).toBeUndefined();
	});
});

describe("setPriceCurrencyStripeId", () => {
	test("writes the top-level slot for the base currency", () => {
		const config: CurrencyAwarePriceConfig = {
			type: "fixed",
			amount: 10,
			base_currency: "usd",
		};
		setPriceCurrencyStripeId({
			config,
			currency: "usd",
			orgDefault: "usd",
			slot: "stripe_price_id",
			id: "price_usd",
		});
		expect(config.stripe_price_id).toBe("price_usd");
		expect(config.currencies).toBeUndefined();
	});

	test("writes the per-currency block for a non-base currency, creating it", () => {
		const config: CurrencyAwarePriceConfig = {
			type: "fixed",
			amount: 10,
			base_currency: "usd",
		};
		setPriceCurrencyStripeId({
			config,
			currency: "eur",
			orgDefault: "usd",
			slot: "stripe_price_id",
			id: "price_eur",
		});
		expect(config.currencies?.eur?.stripe_price_id).toBe("price_eur");
		expect(config.stripe_price_id).toBeUndefined();
	});

	test("preserves an existing per-currency amount when writing an id", () => {
		const config: CurrencyAwarePriceConfig = {
			type: "fixed",
			amount: 10,
			base_currency: "usd",
			currencies: { eur: { amount: 9 } },
		};
		setPriceCurrencyStripeId({
			config,
			currency: "eur",
			orgDefault: "usd",
			slot: "stripe_price_id",
			id: "price_eur",
		});
		expect(config.currencies?.eur?.amount).toBe(9);
		expect(config.currencies?.eur?.stripe_price_id).toBe("price_eur");
	});

	test("a nullish id clears the top-level slot for the base currency", () => {
		const config: CurrencyAwarePriceConfig = {
			base_currency: "usd",
			stripe_price_id: "stale",
		};
		setPriceCurrencyStripeId({
			config,
			currency: "usd",
			orgDefault: "usd",
			slot: "stripe_price_id",
			id: undefined,
		});
		expect(config.stripe_price_id).toBeUndefined();
	});

	test("a nullish id is a no-op for a non-base currency with no existing block", () => {
		const config: CurrencyAwarePriceConfig = { base_currency: "usd" };
		setPriceCurrencyStripeId({
			config,
			currency: "eur",
			orgDefault: "usd",
			slot: "stripe_price_id",
			id: undefined,
		});
		expect(config.currencies).toBeUndefined();
	});
});

describe("priceHasCurrencyAmounts", () => {
	const base = { base_currency: "usd" };

	test("always true for the base currency", () => {
		expect(
			priceHasCurrencyAmounts({
				config: base,
				currency: "usd",
				orgDefault: "usd",
				isFixed: true,
			}),
		).toBe(true);
	});

	test("false when the currency block is missing", () => {
		expect(
			priceHasCurrencyAmounts({
				config: base,
				currency: "eur",
				orgDefault: "usd",
				isFixed: true,
			}),
		).toBe(false);
	});

	test("false for an id-only block (no amounts)", () => {
		const config: CurrencyAwarePriceConfig = {
			...base,
			currencies: { eur: { stripe_price_id: "price_eur" } },
		};
		expect(
			priceHasCurrencyAmounts({
				config,
				currency: "eur",
				orgDefault: "usd",
				isFixed: true,
			}),
		).toBe(false);
		expect(
			priceHasCurrencyAmounts({
				config,
				currency: "eur",
				orgDefault: "usd",
				isFixed: false,
			}),
		).toBe(false);
	});

	test("fixed requires amount; usage requires non-empty usage_tiers", () => {
		const config: CurrencyAwarePriceConfig = {
			...base,
			currencies: {
				eur: { amount: 9 },
				gbp: { usage_tiers: [{ to: -1, amount: 8 }] },
			},
		};
		expect(
			priceHasCurrencyAmounts({
				config,
				currency: "eur",
				orgDefault: "usd",
				isFixed: true,
			}),
		).toBe(true);
		expect(
			priceHasCurrencyAmounts({
				config,
				currency: "eur",
				orgDefault: "usd",
				isFixed: false,
			}),
		).toBe(false);
		expect(
			priceHasCurrencyAmounts({
				config,
				currency: "gbp",
				orgDefault: "usd",
				isFixed: false,
			}),
		).toBe(true);
	});
});
