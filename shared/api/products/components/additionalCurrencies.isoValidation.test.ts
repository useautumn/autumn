import { describe, expect, test } from "bun:test";
import {
	AdditionalCurrencyPriceSchema,
	AdditionalCurrencyTierSchema,
} from "./additionalCurrencies";

describe("additional currency schemas reject non-ISO codes", () => {
	test("flat price accepts real codes, rejects made-up ones", () => {
		expect(
			AdditionalCurrencyPriceSchema.safeParse({ currency: "eur", amount: 9 })
				.success,
		).toBe(true);
		expect(
			AdditionalCurrencyPriceSchema.safeParse({ currency: "xyz", amount: 9 })
				.success,
		).toBe(false);
		expect(
			AdditionalCurrencyPriceSchema.safeParse({ currency: "euro", amount: 9 })
				.success,
		).toBe(false);
	});

	test("tier accepts real codes, rejects made-up ones", () => {
		expect(
			AdditionalCurrencyTierSchema.safeParse({ currency: "gbp", amount: 1 })
				.success,
		).toBe(true);
		expect(
			AdditionalCurrencyTierSchema.safeParse({ currency: "abc", amount: 1 })
				.success,
		).toBe(false);
	});
});
