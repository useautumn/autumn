import { describe, expect, test } from "bun:test";
import {
	CURRENCY_CODES,
	currencyDecimalPlaces,
	isValidCurrencyCode,
	roundToCurrencyPrecision,
} from "./isoCurrencies";

describe("isValidCurrencyCode", () => {
	test("accepts real ISO codes case-insensitively", () => {
		expect(isValidCurrencyCode("usd")).toBe(true);
		expect(isValidCurrencyCode("EUR")).toBe(true);
		expect(isValidCurrencyCode("gbp")).toBe(true);
	});

	test("rejects made-up or malformed codes", () => {
		expect(isValidCurrencyCode("xyz")).toBe(false);
		expect(isValidCurrencyCode("abc")).toBe(false);
		expect(isValidCurrencyCode("eu")).toBe(false);
		expect(isValidCurrencyCode("euro")).toBe(false);
		expect(isValidCurrencyCode("")).toBe(false);
		expect(isValidCurrencyCode(null)).toBe(false);
		expect(isValidCurrencyCode(undefined)).toBe(false);
	});
});

describe("CURRENCY_CODES", () => {
	test("is a non-empty, lowercase, de-duplicated list including common codes", () => {
		expect(CURRENCY_CODES.length).toBeGreaterThan(100);
		expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
		expect(CURRENCY_CODES).toContain("usd");
		expect(CURRENCY_CODES).toContain("eur");
		expect(CURRENCY_CODES.every((c) => c === c.toLowerCase())).toBe(true);
	});
});

describe("currencyDecimalPlaces", () => {
	test("returns the currency's minor units", () => {
		expect(currencyDecimalPlaces("usd")).toBe(2);
		expect(currencyDecimalPlaces("eur")).toBe(2);
		expect(currencyDecimalPlaces("jpy")).toBe(0);
		expect(currencyDecimalPlaces("bhd")).toBe(3);
	});

	test("defaults to 2 for unknown codes", () => {
		expect(currencyDecimalPlaces("xyz")).toBe(2);
	});
});

describe("roundToCurrencyPrecision", () => {
	test("rounds to the currency's minor units", () => {
		expect(roundToCurrencyPrecision(18.33456, "usd")).toBe(18.33);
		expect(roundToCurrencyPrecision(18.5, "eur")).toBe(18.5);
		expect(roundToCurrencyPrecision(18.6, "jpy")).toBe(19);
		expect(roundToCurrencyPrecision(1.23456, "bhd")).toBe(1.235);
	});
});
