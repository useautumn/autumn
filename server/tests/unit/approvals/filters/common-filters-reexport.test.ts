/**
 * S1 contract: filter primitives live in `shared/api/common/filters` and the
 * migration paths re-export the exact same symbols, so behaviour can't drift.
 *
 * Red (before):  `@autumn/shared/api/common/filters` does not exist.
 * Green (after): identity holds and both paths give identical results.
 */

import { describe, expect, test } from "bun:test";
import * as common from "@autumn/shared/api/common/filters/index.js";
import * as migrationArrayFilter from "@autumn/shared/api/migrations/filters/arrayFilter.js";
import * as migrationMatch from "@autumn/shared/api/migrations/filters/match/index.js";
import * as migrationMatcher from "@autumn/shared/api/migrations/filters/matcher.js";

const commonExports = { ...common };
const migrationExports = {
	...migrationMatcher,
	...migrationArrayFilter,
	...migrationMatch,
};

const PRIMITIVE_NAMES: (keyof typeof common)[] = [
	"StringMatcherSchema",
	"NumberMatcherSchema",
	"BooleanMatcherSchema",
	"enumMatcher",
	"nullableObjectFilter",
	"arrayFilter",
	"arrayFilterMatches",
	"nullableFieldMatches",
	"numberMatcherMatches",
	"stringMatcherMatches",
];

describe("common filters: migration paths re-export the same symbols", () => {
	test.each(PRIMITIVE_NAMES)("%s is the same reference", (name) => {
		expect(commonExports[name]).toBeDefined();
		expect(migrationExports[name]).toBe(commonExports[name]);
	});

	test("migration paths export nothing the common path lacks", () => {
		const missing = Object.keys(migrationExports).filter(
			(name) => !(name in commonExports),
		);
		expect(missing).toEqual([]);
	});
});

const bothPaths: { path: string; fns: typeof common }[] = [
	{ path: "common", fns: commonExports },
	{ path: "migrations", fns: migrationExports },
];

describe.each(bothPaths)("matchers via $path path", ({ fns }) => {
	test("numberMatcherMatches", () => {
		const cases = [
			{ matcher: 5, value: 5, expected: true },
			{ matcher: null, value: undefined, expected: true },
			{ matcher: { $lte: 20 }, value: 20, expected: true },
			{ matcher: { $lt: 20 }, value: 20, expected: false },
			{ matcher: { $gt: 0 }, value: null, expected: false },
			{ matcher: { $in: [1, 2] }, value: 3, expected: false },
			{ matcher: { $ne: null }, value: 0, expected: true },
		];
		for (const { matcher, value, expected } of cases) {
			expect(fns.numberMatcherMatches({ matcher, value })).toBe(expected);
		}
	});

	test("stringMatcherMatches", () => {
		const cases = [
			{ matcher: "pro", value: "pro", expected: true },
			{ matcher: { $in: ["pro", "team"] }, value: "free", expected: false },
			{ matcher: { $nin: ["pro"] }, value: "free", expected: true },
			{ matcher: { $eq: null }, value: null, expected: true },
		];
		for (const { matcher, value, expected } of cases) {
			expect(fns.stringMatcherMatches({ matcher, value })).toBe(expected);
		}
		expect(() =>
			fns.stringMatcherMatches({ matcher: { $regex: "^p" }, value: "pro" }),
		).toThrow();
	});

	test("arrayFilterMatches", () => {
		const matchesElement = ({
			filter,
			item,
		}: {
			filter: { min: number };
			item: number;
		}) => item >= filter.min;
		const run = (
			filter: common.ArrayQuantifierFilter<{ min: number }>,
			items: number[],
		) => fns.arrayFilterMatches({ filter, items, matchesElement });

		expect(run({ min: 5 }, [1, 6])).toBe(true);
		expect(run({ $every: { min: 5 } }, [1, 6])).toBe(false);
		expect(run({ $every: { min: 5 } }, [])).toBe(true);
		expect(run({ $none: { min: 5 } }, [1, 2])).toBe(true);
		expect(run({ $some: { min: 5 } }, [])).toBe(false);
	});

	test("nullableFieldMatches", () => {
		const innerMatches = ({ value }: { filter: object; value: unknown }) =>
			value === "x";
		const run = (filter: unknown, value: unknown) =>
			fns.nullableFieldMatches({
				filter: filter as object | null,
				value,
				innerMatches,
			});

		expect(run(undefined, null)).toBe(true);
		expect(run(null, null)).toBe(true);
		expect(run(null, "x")).toBe(false);
		expect(run({ $ne: null }, "x")).toBe(true);
		expect(run({ $eq: null }, "x")).toBe(false);
		expect(run({}, "x")).toBe(true);
		expect(run({}, null)).toBe(false);
	});
});
