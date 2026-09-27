import { describe, expect, test } from "bun:test";
import { CURRENCY_CODES } from "@autumn/shared";
import {
	currencyToRateCode,
	UnknownCurrencyError,
} from "../../src/currencyToRateCode";
import oxrCurrencies from "./fixtures/oxrCurrencies.json";

const providerCodes = new Set(Object.keys(oxrCurrencies));

describe("currencyToRateCode", () => {
	test("every Stripe presentment currency resolves to a code the provider quotes", () => {
		const unresolved = CURRENCY_CODES.filter(
			(currency) => !providerCodes.has(currencyToRateCode({ currency }).code),
		);
		expect(unresolved).toEqual([]);
	});

	test("usd is USD at scale 1, whatever the casing", () => {
		expect(currencyToRateCode({ currency: "usd" })).toEqual({
			code: "USD",
			scale: 1,
		});
		expect(currencyToRateCode({ currency: " EUR " })).toEqual({
			code: "EUR",
			scale: 1,
		});
	});

	test("std is quoted as STN, 1000 old dobra per new", () => {
		expect(currencyToRateCode({ currency: "std" })).toEqual({
			code: "STN",
			scale: 1000,
		});
	});

	test("anything that is not a 3-letter code throws", () => {
		expect(() => currencyToRateCode({ currency: "us dollar" })).toThrow(
			UnknownCurrencyError,
		);
		expect(() => currencyToRateCode({ currency: "" })).toThrow(
			UnknownCurrencyError,
		);
	});
});
