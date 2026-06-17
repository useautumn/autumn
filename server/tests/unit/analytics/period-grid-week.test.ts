// generateAllPeriods must build a Monday-aligned weekly grid so it lines up with
// the pipe's toStartOfWeek(hour, 1, tz) buckets (mode 1 = ISO / Monday start).
// Like the day/month grid, week buckets are anchored in the viewer's timezone.

import { expect, test } from "bun:test";
import chalk from "chalk";
import { generateAllPeriods } from "@/internal/analytics/actions/aggregate.js";

// Returns the day-of-week (0=Sun..6=Mon..) for the calendar date portion of a
// "yyyy-MM-dd HH:mm:ss" bucket string, independent of the test runner's zone.
const calendarWeekday = (period: string): number => {
	const [y, m, d] = period.slice(0, 10).split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const MONDAY = 1;

test(`${chalk.yellowBright(
	"analytics period grid: weekly buckets are Monday-aligned (UTC viewer)",
)}`, () => {
	// 2026-05-01 is a Friday; its Monday-start week begins 2026-04-27.
	// 2026-06-01 is itself a Monday, so it is the final bucket.
	const periods = generateAllPeriods({
		startDate: "2026-05-01 00:00:00",
		endDate: "2026-06-01 00:00:00",
		binSize: "week",
		timezone: "UTC",
	});

	expect(periods).toEqual([
		"2026-04-27 00:00:00",
		"2026-05-04 00:00:00",
		"2026-05-11 00:00:00",
		"2026-05-18 00:00:00",
		"2026-05-25 00:00:00",
		"2026-06-01 00:00:00",
	]);
});

test(`${chalk.yellowBright(
	"analytics period grid: every weekly bucket is a Monday at local midnight (non-UTC viewer)",
)}`, () => {
	const periods = generateAllPeriods({
		startDate: "2026-05-01 03:00:00",
		endDate: "2026-06-05 03:00:00",
		binSize: "week",
		timezone: "America/New_York",
	});

	expect(periods.length).toBeGreaterThan(0);
	for (const period of periods) {
		expect(period.endsWith("00:00:00")).toBe(true);
		expect(calendarWeekday(period)).toBe(MONDAY);
	}
	// Consecutive buckets are exactly 7 days apart.
	for (let i = 1; i < periods.length; i++) {
		const prev = new Date(`${periods[i - 1].replace(" ", "T")}Z`).getTime();
		const curr = new Date(`${periods[i].replace(" ", "T")}Z`).getTime();
		expect((curr - prev) / (24 * 60 * 60 * 1000)).toBe(7);
	}
});
