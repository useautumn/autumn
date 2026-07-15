import { describe, expect, test } from "bun:test";
import { FixedPriceConfigSchema } from "./fixedPriceConfig.js";
import { UsagePriceConfigSchema } from "./usagePriceConfig.js";

describe("FixedPriceConfig additional currencies", () => {
	test("preserves base_currency and the per-currency amounts map", () => {
		const parsed = FixedPriceConfigSchema.parse({
			type: "fixed",
			amount: 10,
			interval: "month",
			base_currency: "usd",
			currencies: { eur: { amount: 9 }, gbp: { amount: 8 } },
		});

		expect(parsed.base_currency).toBe("usd");
		expect(parsed.currencies?.eur?.amount).toBe(9);
		expect(parsed.currencies?.gbp?.amount).toBe(8);
	});

	test("parses without currency fields (backward compatible)", () => {
		const parsed = FixedPriceConfigSchema.parse({
			type: "fixed",
			amount: 10,
			interval: "month",
		});

		expect(parsed.base_currency).toBeUndefined();
		expect(parsed.currencies).toBeUndefined();
	});
});

describe("UsagePriceConfig additional currencies", () => {
	test("preserves base_currency and per-currency usage_tiers", () => {
		const parsed = UsagePriceConfigSchema.parse({
			type: "usage",
			bill_when: "end_of_period",
			internal_feature_id: "if_1",
			feature_id: "messages",
			usage_tiers: [{ to: "inf", amount: 0.5 }],
			interval: "month",
			base_currency: "usd",
			currencies: { eur: { usage_tiers: [{ to: "inf", amount: 0.4 }] } },
		});

		expect(parsed.base_currency).toBe("usd");
		expect(parsed.currencies?.eur?.usage_tiers?.[0].amount).toBe(0.4);
	});

	test("parses without currency fields (backward compatible)", () => {
		const parsed = UsagePriceConfigSchema.parse({
			type: "usage",
			bill_when: "end_of_period",
			internal_feature_id: "if_1",
			feature_id: "messages",
			usage_tiers: [{ to: "inf", amount: 0.5 }],
			interval: "month",
		});

		expect(parsed.currencies).toBeUndefined();
	});
});

describe("PriceCurrencyConfig per-currency stripe id slots (Phase 2a)", () => {
	test("FixedPriceConfig round-trips per-currency stripe ids", () => {
		const parsed = FixedPriceConfigSchema.parse({
			type: "fixed",
			amount: 10,
			interval: "month",
			base_currency: "usd",
			currencies: {
				eur: {
					amount: 9,
					stripe_price_id: "price_eur",
					stripe_empty_price_id: "price_eur_empty",
					stripe_placeholder_price_id: "price_eur_placeholder",
					stripe_prepaid_price_v2_id: "price_eur_prepaid_v2",
				},
			},
		});

		expect(parsed.currencies?.eur?.stripe_price_id).toBe("price_eur");
		expect(parsed.currencies?.eur?.stripe_empty_price_id).toBe("price_eur_empty");
		expect(parsed.currencies?.eur?.stripe_placeholder_price_id).toBe(
			"price_eur_placeholder",
		);
		expect(parsed.currencies?.eur?.stripe_prepaid_price_v2_id).toBe(
			"price_eur_prepaid_v2",
		);
	});

	test("UsagePriceConfig round-trips a per-currency stripe price id", () => {
		const parsed = UsagePriceConfigSchema.parse({
			type: "usage",
			bill_when: "end_of_period",
			internal_feature_id: "if_1",
			feature_id: "messages",
			usage_tiers: [{ to: "inf", amount: 0.5 }],
			interval: "month",
			base_currency: "usd",
			currencies: {
				eur: {
					usage_tiers: [{ to: "inf", amount: 0.4 }],
					stripe_price_id: "price_eur",
				},
			},
		});

		expect(parsed.currencies?.eur?.stripe_price_id).toBe("price_eur");
	});
});
