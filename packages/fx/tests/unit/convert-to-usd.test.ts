import { describe, expect, test } from "bun:test";
import { convertToUsd, MissingRateError } from "../../src/convertToUsd";
import type { UsdRateTable } from "../../src/types/usdRateTable";

const table: UsdRateTable = {
	date: "2026-09-26",
	source: "openexchangerates",
	rates: { USD: 1, EUR: 0.92, JPY: 150, BHD: 0.376, STN: 22.5, XXX: 0 },
};

describe("convertToUsd", () => {
	test("USD passes through at rate 1 even if the table omits it", () => {
		const usdless = { ...table, rates: { EUR: 0.92 } };
		expect(
			convertToUsd({ amount: 375, currency: "usd", rateTable: usdless }),
		).toEqual({
			amountUsd: 375,
			rateCode: "USD",
			rate: 1,
			rateDate: "2026-09-26",
			source: "openexchangerates",
		});
	});

	test("EUR 100 at 0.92 → 108.70", () => {
		expect(
			convertToUsd({ amount: 100, currency: "eur", rateTable: table })
				.amountUsd,
		).toBe(108.7);
	});

	test("JPY is already major units in Postgres: 1500 at 150 → 10.00", () => {
		expect(
			convertToUsd({ amount: 1500, currency: "jpy", rateTable: table })
				.amountUsd,
		).toBe(10);
	});

	test("three-decimal BHD 12.345 at 0.376 → 32.83", () => {
		expect(
			convertToUsd({ amount: 12.345, currency: "bhd", rateTable: table })
				.amountUsd,
		).toBe(32.83);
	});

	test("std is scaled to STN before the rate: 45000 STD = 45 STN at 22.5 → 2.00", () => {
		const conversion = convertToUsd({
			amount: 45_000,
			currency: "std",
			rateTable: table,
		});
		expect(conversion).toMatchObject({
			amountUsd: 2,
			rateCode: "STN",
			rate: 22.5,
		});
	});

	test("rounds once, half-up, to cents", () => {
		// 1.005 EUR / 1 = 1.005 → 1.01 (half-up), where float math would give 1.00
		const unity = { ...table, rates: { EUR: 1 } };
		expect(
			convertToUsd({ amount: 1.005, currency: "eur", rateTable: unity })
				.amountUsd,
		).toBe(1.01);
	});

	test("a currency missing from the table throws, never 0 or 1", () => {
		expect(() =>
			convertToUsd({ amount: 10, currency: "gbp", rateTable: table }),
		).toThrow(MissingRateError);
	});

	test("a zero or negative rate is treated as missing", () => {
		expect(() =>
			convertToUsd({ amount: 10, currency: "xxx", rateTable: table }),
		).toThrow(MissingRateError);
	});
});
