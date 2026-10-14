import { expect, test } from "bun:test";
import chalk from "chalk";
import { generateAllPeriods } from "@/internal/analytics/actions/aggregate.js";

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

	expect(periods[periods.length - 1]).toBe("2026-06-04 00:00:00");
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
