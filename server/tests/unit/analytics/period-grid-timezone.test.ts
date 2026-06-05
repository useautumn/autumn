// generateAllPeriods must build the day/month grid in the viewer's timezone so
// it lines up with the pipe's toStartOfDay(hour, tz) buckets; a UTC grid drops
// the newest local day for non-UTC viewers.
// Ref: tickets/ANALYTICS_TIMEZONE_BUCKET_OFFSET.md

import { expect, test } from "bun:test";
import chalk from "chalk";
import { generateAllPeriods } from "@/internal/analytics/actions/aggregate.js";

// Window expressed in UTC wall-clock (what calculateDateRange produces and the
// Tinybird pipe filters `hour` on). 2026-06-05 03:00 UTC is still 2026-06-04
// 23:00 in America/New_York (EDT, UTC-4) -> the viewer's "today" is Jun 4.
const START_UTC = "2026-05-29 03:00:00";
const END_UTC = "2026-06-05 03:00:00";

test(`${chalk.yellowBright(
	"analytics period grid: non-UTC viewer's latest day labeled by local calendar day",
)}`, () => {
	const periods = generateAllPeriods({
		startDate: START_UTC,
		endDate: END_UTC,
		binSize: "day",
		timezone: "America/New_York",
	});

	// The pipe buckets the live "today" data into the viewer's local day
	// (Jun 4 in New York). The grid's newest bucket must match that string,
	// not the UTC day (Jun 5).
	expect(periods[periods.length - 1]).toBe("2026-06-04 00:00:00");
	// And the earliest bucket should be the viewer's local start day, not the
	// UTC start day.
	expect(periods[0]).toBe("2026-05-28 00:00:00");
});

test(`${chalk.yellowBright(
	"analytics period grid: UTC viewer unchanged (no regression)",
)}`, () => {
	const periods = generateAllPeriods({
		startDate: START_UTC,
		endDate: END_UTC,
		binSize: "day",
		timezone: "UTC",
	});

	expect(periods[0]).toBe("2026-05-29 00:00:00");
	expect(periods[periods.length - 1]).toBe("2026-06-05 00:00:00");
});

// Spot-check the acceptance-criteria zones at one instant just past UTC
// midnight (2026-06-05 02:00 UTC). West-of-UTC viewers are still on Jun 4
// locally; UTC / UTC+1 viewers have rolled to Jun 5.
const BOUNDARY_END_UTC = "2026-06-05 02:00:00";
const BOUNDARY_START_UTC = "2026-06-01 02:00:00";

const zoneCases: { timezone: string; expectedLatest: string }[] = [
	{ timezone: "America/Los_Angeles", expectedLatest: "2026-06-04 00:00:00" },
	{ timezone: "America/New_York", expectedLatest: "2026-06-04 00:00:00" },
	{ timezone: "UTC", expectedLatest: "2026-06-05 00:00:00" },
	{ timezone: "Europe/London", expectedLatest: "2026-06-05 00:00:00" },
];

for (const { timezone, expectedLatest } of zoneCases) {
	test(`${chalk.yellowBright(
		`analytics period grid: latest local day for ${timezone}`,
	)}`, () => {
		const periods = generateAllPeriods({
			startDate: BOUNDARY_START_UTC,
			endDate: BOUNDARY_END_UTC,
			binSize: "day",
			timezone,
		});
		expect(periods[periods.length - 1]).toBe(expectedLatest);
	});
}
