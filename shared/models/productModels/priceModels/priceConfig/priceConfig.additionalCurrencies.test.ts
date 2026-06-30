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
