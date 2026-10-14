import { describe, expect, test } from "bun:test";
import { Decimal } from "decimal.js";
import { sumValues } from "../utils";
import { roundCacheBalance } from "./mathUtils";

const decimalSum = (vals: number[]) =>
	vals.reduce((acc, curr) => acc.add(curr), new Decimal(0)).toNumber();
const decimalRound = (value: number) =>
	new Decimal(value).toDecimalPlaces(10).toNumber();

const SAFE = Number.MAX_SAFE_INTEGER;
const values = [
	0,
	-0,
	1,
	-1,
	999_999_799,
	-999_998_799,
	1_000_000_000_000,
	SAFE,
	-SAFE,
	SAFE + 1,
	2 ** 60,
	1e21,
	0.1,
	0.2,
	-0.3,
	1.0000000000123,
	123.456789012345,
	1e-12,
];

/** Every list of up to three values, so integer, unsafe and fractional ones meet in every order. */
const lists = [[] as number[]].concat(
	values.map((a) => [a]),
	values.flatMap((a) => values.map((b) => [a, b])),
	values.flatMap((a) => values.flatMap((b) => values.map((c) => [a, b, c]))),
);

describe("sums and rounding skip Decimal for integers and return what Decimal returns", () => {
	test("sumValues", () => {
		for (const list of lists)
			expect(Object.is(sumValues(list), decimalSum(list))).toBe(true);
	});

	test("a sum that leaves the safe integers is added by Decimal", () => {
		expect(sumValues([SAFE, 2])).toBe(decimalSum([SAFE, 2]));
		expect(sumValues([SAFE, 1, -1])).toBe(decimalSum([SAFE, 1, -1]));
	});

	test("roundCacheBalance", () => {
		for (const value of values)
			expect(Object.is(roundCacheBalance(value), decimalRound(value))).toBe(
				true,
			);
		expect(roundCacheBalance(null)).toBe(0);
		expect(roundCacheBalance(undefined)).toBe(0);
	});
});
