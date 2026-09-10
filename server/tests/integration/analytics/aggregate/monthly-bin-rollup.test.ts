/**
 * Contract for bin_size="month" over a window whose ends are partial months: the complete
 * calendar months inside it are served from the monthly rollups, the partial months at
 * either end from the hourly rollups, and the two never overlap or leave a gap.
 *
 * Covered:
 *   - mixed-resolution window (Jun 15 -> Aug 10): one bin per calendar month, each exact,
 *     including events in the first and last hour of every month seam
 *   - a window with no complete month stays on the hourly path and is still exact
 *   - group_by on a property: per-month, per-group values reconcile
 *   - the day-bin control over the same window reports the same total, so the
 *     monthly-plus-edges union matches the path it replaces
 *
 * Bins are asserted in period order, ignoring empty ones: the API derives `period` by
 * parsing the pipe's UTC wall-clock label in the server's local zone
 * (convertPeriodsToEpoch, and generateAllPeriods for the zero-filled grid), so on a
 * non-UTC server the epoch shifts by that offset and the grid can carry a spurious empty
 * leading bin. Only the order and the non-empty values are zone-independent.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const EVENT_INGEST_TIMEOUT_MS = 40_000;
const POLL_INTERVAL_MS = 3_000;

const WINDOW_START = Date.UTC(2026, 5, 15, 12);
const WINDOW_END = Date.UTC(2026, 7, 10, 9);
const AUGUST_START = Date.UTC(2026, 7, 1);

// Every event sits on an exact hour: the rollups filter on the hour bucket, so a sub-hour
// boundary would make the window's first bucket ambiguous for reasons unrelated to months.
// The seam hours (Jul 1 00:00, Jul 31 23:00, Aug 1 00:00) are the rows that would double
// count or vanish if the monthly interior and the hourly edges overlapped.
const EVENTS = [
	{ at: Date.UTC(2026, 5, 15, 12), value: 5, region: "us" },
	{ at: Date.UTC(2026, 5, 30, 23), value: 7, region: "eu" },
	{ at: Date.UTC(2026, 6, 1, 0), value: 11, region: "us" },
	{ at: Date.UTC(2026, 6, 20, 10), value: 13, region: "us" },
	{ at: Date.UTC(2026, 6, 31, 23), value: 17, region: "eu" },
	{ at: Date.UTC(2026, 7, 1, 0), value: 19, region: "us" },
	{ at: Date.UTC(2026, 7, 10, 8), value: 23, region: "eu" },
];

const JUNE = { total: 12, us: 5, eu: 7 };
const JULY = { total: 41, us: 24, eu: 17 };
const AUGUST = { total: 42, us: 19, eu: 23 };
const WINDOW_TOTAL = JUNE.total + JULY.total + AUGUST.total;

type AggregateResponse = {
	list: {
		period: number;
		values: Record<string, number>;
		grouped_values?: Record<string, Record<string, number>>;
	}[];
	total: Record<string, { count: number; sum: number }>;
};

/** One entry per bin that carries data, oldest first, collapsing rows that share a period. */
const binsInOrder = (
	response: AggregateResponse,
): { value: number; groups: Record<string, number> }[] => {
	const byPeriod = new Map<
		number,
		{ value: number; groups: Record<string, number> }
	>();
	for (const row of response.list) {
		const bin = byPeriod.get(row.period) ?? { value: 0, groups: {} };
		bin.value += row.values[TestFeature.Messages] ?? 0;
		for (const [group, value] of Object.entries(
			row.grouped_values?.[TestFeature.Messages] ?? {},
		)) {
			bin.groups[group] = (bin.groups[group] ?? 0) + value;
		}
		byPeriod.set(row.period, bin);
	}
	return [...byPeriod.entries()]
		.sort(([a], [b]) => a - b)
		.map(([, bin]) => bin)
		.filter((bin) => bin.value !== 0);
};

test.concurrent(
	`${chalk.yellowBright("aggregate monthly bins: complete months come from the monthly rollup, partial months from the hourly edges")}`,
	async () => {
		// Unique per run: tracked events persist in Tinybird across runs (deleting the
		// customer doesn't purge them), so a reused id double-counts every sum below.
		const customerId = `aggregate-monthly-bins-${Date.now()}`;
		const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd], prefix: customerId }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		for (const event of EVENTS) {
			await autumnV2_4.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: event.value,
				timestamp: event.at,
				properties: { region: event.region },
			});
		}

		// Events reach Tinybird via async batching, so poll on the ungated totals before
		// asserting anything — otherwise a slow ingest reads as a routing bug.
		const deadline = Date.now() + EVENT_INGEST_TIMEOUT_MS;
		let monthly: AggregateResponse;
		do {
			await timeout(POLL_INTERVAL_MS);
			monthly = (await autumnV2_4.events.aggregate({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				custom_range: { start: WINDOW_START, end: WINDOW_END },
				bin_size: "month",
			})) as AggregateResponse;
		} while (
			Date.now() < deadline &&
			monthly.total[TestFeature.Messages]?.sum !== WINDOW_TOTAL
		);

		// ── Mixed-resolution window: one bin per calendar month, each exact ──────────
		expect(monthly.total[TestFeature.Messages]?.count).toBe(EVENTS.length);
		expect(monthly.total[TestFeature.Messages]?.sum).toBe(WINDOW_TOTAL);

		// June and August are partial (hourly edges); July is whole (monthly rollup).
		expect(binsInOrder(monthly).map((bin) => bin.value)).toEqual([
			JUNE.total,
			JULY.total,
			AUGUST.total,
		]);

		// ── A window with no complete month keeps the hourly path ───────────────────
		const augustOnly = (await autumnV2_4.events.aggregate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			custom_range: { start: AUGUST_START, end: WINDOW_END },
			bin_size: "month",
		})) as AggregateResponse;

		expect(augustOnly.total[TestFeature.Messages]?.sum).toBe(AUGUST.total);
		expect(binsInOrder(augustOnly).map((bin) => bin.value)).toEqual([
			AUGUST.total,
		]);

		// ── Grouped monthly: per-month, per-group values reconcile ──────────────────
		const grouped = (await autumnV2_4.events.aggregate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			group_by: "properties.region",
			custom_range: { start: WINDOW_START, end: WINDOW_END },
			bin_size: "month",
		})) as AggregateResponse;

		expect(
			binsInOrder(grouped).map((bin) => ({
				us: bin.groups.us ?? 0,
				eu: bin.groups.eu ?? 0,
			})),
		).toEqual([
			{ us: JUNE.us, eu: JUNE.eu },
			{ us: JULY.us, eu: JULY.eu },
			{ us: AUGUST.us, eu: AUGUST.eu },
		]);

		// ── Parity with the path the monthly rollup replaces ────────────────────────
		const daily = (await autumnV2_4.events.aggregate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			custom_range: { start: WINDOW_START, end: WINDOW_END },
			bin_size: "day",
		})) as AggregateResponse;

		const dailySum = binsInOrder(daily).reduce(
			(sum, bin) => sum + bin.value,
			0,
		);
		expect(dailySum).toBe(WINDOW_TOTAL);
		expect(daily.total[TestFeature.Messages]?.sum).toBe(WINDOW_TOTAL);
	},
);
