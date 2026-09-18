/**
 * The progress bar denominator was always the migration's whole filter count,
 * so a single-customer or sample run read "0 of 40,000" and looked stalled when
 * it was really 0 of 1.
 *
 * Red (current):  runExpectedCount does not exist.
 * Green (after):  a run scoped by only_ids or target_limit reports its own
 *                 scope; an unscoped Run All still reports the filter count.
 */

import { expect, test } from "bun:test";
import { runExpectedCount } from "./runScope";

const FILTER_COUNT = 40_000;

test("a single-customer run counts one customer, not the whole filter", () => {
	expect(
		runExpectedCount({
			run: { only_ids: ["cus_a"], target_limit: null },
			filterCount: FILTER_COUNT,
		}),
	).toBe(1);
});

test("an only_ids run counts the ids it was given", () => {
	expect(
		runExpectedCount({
			run: { only_ids: ["cus_a", "cus_b", "cus_c"], target_limit: null },
			filterCount: FILTER_COUNT,
		}),
	).toBe(3);
});

test("a sample run counts its target limit", () => {
	expect(
		runExpectedCount({
			run: { only_ids: null, target_limit: 10 },
			filterCount: FILTER_COUNT,
		}),
	).toBe(10);
});

test("a sample larger than the filter cannot exceed the filter", () => {
	expect(
		runExpectedCount({
			run: { only_ids: null, target_limit: 500 },
			filterCount: 42,
		}),
	).toBe(42);
});

test("an unscoped Run All uses the filter count", () => {
	expect(
		runExpectedCount({
			run: { only_ids: null, target_limit: null },
			filterCount: FILTER_COUNT,
		}),
	).toBe(FILTER_COUNT);
});

test("no run at all falls back to the filter count", () => {
	expect(runExpectedCount({ run: undefined, filterCount: FILTER_COUNT })).toBe(
		FILTER_COUNT,
	);
});

test("an unknown filter count stays unknown for an unscoped run", () => {
	expect(
		runExpectedCount({
			run: { only_ids: null, target_limit: null },
			filterCount: null,
		}),
	).toBeNull();
});

test("a scoped run knows its size even before the filter count loads", () => {
	expect(
		runExpectedCount({
			run: { only_ids: null, target_limit: 5 },
			filterCount: null,
		}),
	).toBe(5);
});
