import { expect, test } from "bun:test";
import chalk from "chalk";
import { generateAllPeriods } from "@/internal/analytics/actions/aggregate.js";

const calendarWeekday = (period: string): number => {
	const [y, m, d] = period.slice(0, 10).split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const MONDAY = 1;

test(`${chalk.yellowBright(
	"analytics period grid: weekly buckets are Monday-aligned (UTC viewer)",
)}`, () => {
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
	for (let i = 1; i < periods.length; i++) {
		const prev = new Date(`${periods[i - 1].replace(" ", "T")}Z`).getTime();
		const curr = new Date(`${periods[i].replace(" ", "T")}Z`).getTime();
		expect((curr - prev) / (24 * 60 * 60 * 1000)).toBe(7);
	}
});
