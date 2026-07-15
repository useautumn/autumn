import { describe, expect, test } from "bun:test";
import {
	CURRENCY_CODES,
	currencyDisplayName,
	currencyInputDecimals,
	isValidCurrencyCode,
	roundToCurrencyPrecision,
	stripeMinorUnitFactor,
} from "./stripeCurrencies";

const intlCurrencies =
	typeof (Intl as { supportedValuesOf?: (k: string) => string[] })
		.supportedValuesOf === "function"
		? new Set(
				(
					Intl as unknown as { supportedValuesOf: (k: string) => string[] }
				).supportedValuesOf("currency"),
			)
		: null;

describe("CURRENCY_CODES", () => {
	test("is lowercase, de-duplicated, and leads with common currencies", () => {
		expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
		expect(CURRENCY_CODES.every((c) => c === c.toLowerCase())).toBe(true);
		expect(CURRENCY_CODES.slice(0, 3)).toEqual(["usd", "eur", "gbp"]);
	});

	// Pins the list to Stripe's presentment set (docs.stripe.com/currencies):
	// exact size, includes newer/legacy codes Stripe still presents, and excludes
	// the three-decimal currencies Stripe does NOT present.
	test("matches Stripe's presentment set", () => {
		expect(CURRENCY_CODES.length).toBe(134);
		for (const c of ["rub", "xcg", "std", "sle"]) {
			expect(CURRENCY_CODES).toContain(c);
		}
		for (const c of ["bhd", "kwd", "omr", "jod", "tnd", "mru"]) {
			expect(CURRENCY_CODES).not.toContain(c);
		}
	});

	// Every code needs a static display name (the picker no longer relies on
	// Intl.DisplayNames, which drifts by runtime — e.g. XCG on older browsers).
	test("every listed code has a static display name", () => {
		const missing = CURRENCY_CODES.filter(
			(c) => currencyDisplayName(c).toLowerCase() === c.toLowerCase(),
		);
		expect(missing).toEqual([]);
	});

	// Guards against typos in the transcribed list: every entry must be a real
	// ISO 4217 code per the runtime's ICU tables.
	test("every listed code is a real ISO 4217 code", () => {
		if (!intlCurrencies) return;
		const bogus = CURRENCY_CODES.filter(
			(c) => !intlCurrencies.has(c.toUpperCase()),
		);
		expect(bogus).toEqual([]);
	});
});

describe("isValidCurrencyCode", () => {
	test("accepts supported codes case-insensitively", () => {
		expect(isValidCurrencyCode("usd")).toBe(true);
		expect(isValidCurrencyCode("EUR")).toBe(true);
		expect(isValidCurrencyCode("sle")).toBe(true);
	});

	test("rejects made-up, malformed, or non-presented codes", () => {
		expect(isValidCurrencyCode("xyz")).toBe(false);
		expect(isValidCurrencyCode("euro")).toBe(false);
		expect(isValidCurrencyCode("")).toBe(false);
		expect(isValidCurrencyCode(null)).toBe(false);
		// Real ISO codes Stripe does not present are still rejected.
		expect(isValidCurrencyCode("xdr")).toBe(false);
		expect(isValidCurrencyCode("bhd")).toBe(false);
	});
});

describe("stripeMinorUnitFactor", () => {
	test("is 1 / 100 / 1000 by currency class", () => {
		expect(stripeMinorUnitFactor("jpy")).toBe(1);
		expect(stripeMinorUnitFactor("usd")).toBe(100);
		expect(stripeMinorUnitFactor("eur")).toBe(100);
		expect(stripeMinorUnitFactor("bhd")).toBe(1000);
		expect(stripeMinorUnitFactor("kwd")).toBe(1000);
	});
});

describe("currencyInputDecimals / roundToCurrencyPrecision", () => {
	test("zero-decimal currencies round to whole numbers", () => {
		expect(currencyInputDecimals("jpy")).toBe(0);
		expect(roundToCurrencyPrecision(18.6, "jpy")).toBe(19);
	});

	test("two- and three-decimal currencies both cap input at two decimals", () => {
		expect(currencyInputDecimals("usd")).toBe(2);
		expect(currencyInputDecimals("bhd")).toBe(2);
		expect(roundToCurrencyPrecision(18.33456, "usd")).toBe(18.33);
		// three-decimal currency: capped at two decimals so Stripe amounts stay
		// divisible by ten.
		expect(roundToCurrencyPrecision(1.23456, "bhd")).toBe(1.23);
	});
});
