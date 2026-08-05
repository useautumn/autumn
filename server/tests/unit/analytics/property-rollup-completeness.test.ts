import { expect, test } from "bun:test";
import chalk from "chalk";
import type { AggregateGroupablePipeRow } from "@/external/tinybird/pipes/aggregateGroupablePipe.js";
import {
	type EventTotals,
	groupedResultIsIncomplete,
	propertyRollupCoverageIsIncomplete,
	reportsMoreThan,
	sumAllRows,
	sumGroupedRowsByEventName,
} from "@/internal/analytics/actions/propertyRollupCompleteness.js";

const row = ({
	eventName = "action_calls",
	groupValue,
	totalValue,
	eventCount,
}: {
	eventName?: string;
	groupValue: string;
	totalValue: number;
	eventCount?: number;
}): AggregateGroupablePipeRow => ({
	period: "2026-07-29 00:00:00",
	event_name: eventName,
	group_value: groupValue,
	total_value: totalValue,
	...(eventCount === undefined ? {} : { event_count: eventCount }),
});

const totals = ({
	eventName = "action_calls",
	count,
	sum,
}: {
	eventName?: string;
	count: number;
	sum: number;
}): EventTotals => ({ [eventName]: { count, sum } });

test(`${chalk.yellowBright(
	"property rollup: a result matching the ungated totals is complete",
)}`, () => {
	// StackOne's accountId control: every value is short enough to survive the
	// gate, so the grouped sums reconcile exactly against the totals.
	const rows = [
		row({ groupValue: "2GwnUDjVN8TZtba2AqvCR", totalValue: 18_686 }),
		row({ groupValue: "aRq2ZOEzeItvNlnn8OPFF", totalValue: 11_916 }),
	];

	expect(
		groupedResultIsIncomplete({
			rows,
			totals: totals({ count: 2533, sum: 30_602 }),
		}),
	).toBe(false);
});

test(`${chalk.yellowBright(
	"property rollup: a partially gate-dropped key is detected as incomplete",
)}`, () => {
	// StackOne's projectId: short slugs survive the gate, 32+ char opaque ids are
	// dropped at insert, so a NON-EMPTY result still under-reports by ~93%.
	const rows = [
		row({ groupValue: "qa-71607", totalValue: 970 }),
		row({ groupValue: "give-jeran-a-project-92237", totalValue: 284 }),
		row({ groupValue: "pa-agent-31675", totalValue: 587 }),
		row({ groupValue: "joe-test-94143", totalValue: 39 }),
		row({ groupValue: "sales-prod-39557", totalValue: 108 }),
		row({ groupValue: "production-09042", totalValue: 60 }),
		row({ groupValue: "test-73448", totalValue: 25 }),
		row({ groupValue: "alex-academy-00433", totalValue: 31 }),
		row({ groupValue: "development-66099", totalValue: 18 }),
		row({ groupValue: "integrations---external-31154", totalValue: 1 }),
		row({ groupValue: "bryce-test-13857", totalValue: 1 }),
	];

	expect(
		groupedResultIsIncomplete({
			rows,
			totals: totals({ count: 2533, sum: 30_602 }),
		}),
	).toBe(true);
});

test(`${chalk.yellowBright(
	"property rollup: a fully gate-dropped key is still detected as incomplete",
)}`, () => {
	// mastra's all-UUID project_id: the rollup has zero rows for the key.
	expect(
		groupedResultIsIncomplete({
			rows: [],
			totals: totals({ count: 42, sum: 420 }),
		}),
	).toBe(true);
});

test(`${chalk.yellowBright(
	"property rollup: an empty result with no events is complete",
)}`, () => {
	expect(
		groupedResultIsIncomplete({
			rows: [],
			totals: totals({ count: 0, sum: 0 }),
		}),
	).toBe(false);
});

test(`${chalk.yellowBright(
	"property rollup: float drift between aggregation paths is not a shortfall",
)}`, () => {
	const rows = [row({ groupValue: "qa-71607", totalValue: 30_601.999_999_99 })];

	expect(
		groupedResultIsIncomplete({
			rows,
			totals: totals({ count: 2533, sum: 30_602 }),
		}),
	).toBe(false);
});

test(`${chalk.yellowBright(
	"property rollup: one lossy feature among several marks the result incomplete",
)}`, () => {
	const rows = [
		row({ eventName: "action_calls", groupValue: "qa-71607", totalValue: 500 }),
		row({ eventName: "api_calls", groupValue: "qa-71607", totalValue: 10 }),
	];

	expect(
		groupedResultIsIncomplete({
			rows,
			totals: {
				action_calls: { count: 10, sum: 500 },
				api_calls: { count: 90, sum: 9000 },
			},
		}),
	).toBe(true);
});

test(`${chalk.yellowBright(
	"property rollup: grouped sums exceeding totals are not a shortfall",
)}`, () => {
	// Late-arriving events can land in the rollup before the totals rollup sees
	// them; retrying would not recover anything.
	const rows = [row({ groupValue: "qa-71607", totalValue: 31_000 })];

	expect(
		groupedResultIsIncomplete({
			rows,
			totals: totals({ count: 2533, sum: 30_602 }),
		}),
	).toBe(false);
});

test(`${chalk.yellowBright(
	"property rollup: per-bin top-N truncation is not a shortfall",
)}`, () => {
	// The pipe relabels groups beyond max_groups to AUTUMN_RESERVED rather than
	// dropping them, so a truncated result still carries the full mass. If a pipe
	// change ever drops them instead, every truncated query would retry ungated.
	const rows = [
		row({ groupValue: "qa-71607", totalValue: 722 }),
		row({ groupValue: "AUTUMN_RESERVED", totalValue: 29_880 }),
	];

	expect(
		groupedResultIsIncomplete({
			rows,
			totals: totals({ count: 2533, sum: 30_602 }),
		}),
	).toBe(false);
});

test(`${chalk.yellowBright(
	"property rollup: the ungated retry only wins when it reports more",
)}`, () => {
	// The retry probes whether the shortfall was gate loss or an absent property;
	// an absent property returns the same mass, so the gated result is kept.
	const gated = [row({ groupValue: "qa-71607", totalValue: 2124 })];
	const ungatedWithGateLoss = [
		row({ groupValue: "qa-71607", totalValue: 2124 }),
		row({ groupValue: "4uSlnf8w0kUb5WV6gEmBz07JVvgxfxTR", totalValue: 28_478 }),
	];
	const ungatedWithAbsentProperty = [
		row({ groupValue: "qa-71607", totalValue: 2124 }),
	];

	expect(sumAllRows({ rows: ungatedWithGateLoss })).toBeGreaterThan(
		sumAllRows({ rows: gated }),
	);
	expect(sumAllRows({ rows: ungatedWithAbsentProperty })).toBe(
		sumAllRows({ rows: gated }),
	);
});

test(`${chalk.yellowBright(
	"property rollup: gate-dropped groups whose values cancel are still detected",
)}`, () => {
	// Negative values are mainstream (117 orgs in a 7d prod sample), so dropped
	// groups can net to zero and leave the sum comparison blind. The count can't
	// cancel, so it catches them.
	const rows = [
		row({ groupValue: "qa-71607", totalValue: 500, eventCount: 5 }),
	];

	expect(
		groupedResultIsIncomplete({
			rows,
			totals: { action_calls: { count: 9, sum: 500 } },
		}),
	).toBe(true);
});

test(`${chalk.yellowBright(
	"property rollup: counts matching the totals are complete",
)}`, () => {
	const rows = [
		row({ groupValue: "qa-71607", totalValue: 500, eventCount: 5 }),
		row({ groupValue: "joe-test-94143", totalValue: -500, eventCount: 4 }),
	];

	expect(
		groupedResultIsIncomplete({
			rows,
			totals: { action_calls: { count: 9, sum: 0 } },
		}),
	).toBe(false);
});

test(`${chalk.yellowBright(
	"property rollup: events without the grouped property do not trigger fallback",
)}`, () => {
	const rows = [
		row({ groupValue: "transactional", totalValue: 80, eventCount: 80 }),
		row({ groupValue: "marketing", totalValue: 10, eventCount: 10 }),
	];

	expect(
		propertyRollupCoverageIsIncomplete({
			rows,
			coverage: { action_calls: 90 },
		}),
	).toBe(false);
});

test(`${chalk.yellowBright(
	"property rollup: gate-dropped values still trigger fallback",
)}`, () => {
	const rows = [
		row({ groupValue: "transactional", totalValue: 80, eventCount: 80 }),
		row({ groupValue: "marketing", totalValue: 10, eventCount: 10 }),
	];

	expect(
		propertyRollupCoverageIsIncomplete({
			rows,
			coverage: { action_calls: 100 },
		}),
	).toBe(true);
	expect(
		propertyRollupCoverageIsIncomplete({
			rows: [],
			coverage: { action_calls: 42 },
		}),
	).toBe(true);
});

test(`${chalk.yellowBright(
	"property rollup: falls back to sum-only when the pipe omits counts",
)}`, () => {
	// A deployment predating the count column must not report every result as
	// incomplete just because the field is missing.
	const rows = [row({ groupValue: "qa-71607", totalValue: 500 })];

	expect(
		groupedResultIsIncomplete({
			rows,
			totals: { action_calls: { count: 9, sum: 500 } },
		}),
	).toBe(false);
});

test(`${chalk.yellowBright(
	"property rollup: the retry wins on recovered events even when sums tie",
)}`, () => {
	const gated = [
		row({ groupValue: "qa-71607", totalValue: 500, eventCount: 5 }),
	];
	const ungated = [
		row({ groupValue: "qa-71607", totalValue: 500, eventCount: 5 }),
		row({
			groupValue: "4uSlnf8w0kUb5WV6gEmBz07JVvgxfxTR",
			totalValue: 60,
			eventCount: 2,
		}),
		row({
			groupValue: "stackone-integrations-testing---eu-66912",
			totalValue: -60,
			eventCount: 2,
		}),
	];

	expect(reportsMoreThan({ candidate: ungated, current: gated })).toBe(true);
	expect(reportsMoreThan({ candidate: gated, current: ungated })).toBe(false);
});

test(`${chalk.yellowBright(
	"property rollup: sums grouped rows per event name",
)}`, () => {
	const rows = [
		row({ eventName: "action_calls", groupValue: "a", totalValue: 3 }),
		row({ eventName: "action_calls", groupValue: "b", totalValue: 4 }),
		row({ eventName: "api_calls", groupValue: "a", totalValue: 5 }),
	];

	expect(sumGroupedRowsByEventName({ rows })).toEqual({
		action_calls: 7,
		api_calls: 5,
	});
});
