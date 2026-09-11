// Month ranges ("6m" / "12m") count monthly bins rather than days, so a
// month-binned window must open on the 1st — otherwise the chart leads with a
// partial bar the totals also under-count. Finer bins keep the full period.

import { expect, test } from "bun:test";
import { UTCDate } from "@date-fns/utc";
import chalk from "chalk";
import { generateAllPeriods } from "@/internal/analytics/actions/aggregate.js";
import { getStandardIntervalWindow } from "@/internal/analytics/analyticsUtils.js";

const NOW = new UTCDate("2026-09-11T14:37:12Z");

test(`${chalk.yellowBright(
	"analytics range window: month ranges on month bins start on the 1st",
)}`, () => {
	const twelveMonths = getStandardIntervalWindow({
		interval: "12m",
		binSize: "month",
		now: NOW,
	});
	expect(twelveMonths?.start.toISOString()).toBe("2025-10-01T00:00:00.000Z");

	const sixMonths = getStandardIntervalWindow({
		interval: "6m",
		binSize: "month",
		now: NOW,
	});
	expect(sixMonths?.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
});

test(`${chalk.yellowBright(
	"analytics range window: a month range renders exactly that many monthly bars",
)}`, () => {
	const window = getStandardIntervalWindow({
		interval: "12m",
		binSize: "month",
		now: NOW,
	});

	const periods = generateAllPeriods({
		startDate: window?.start.toISOString() ?? "",
		endDate: window?.end.toISOString() ?? "",
		binSize: "month",
		timezone: "UTC",
	});

	expect(periods).toHaveLength(12);
	expect(periods[0]).toBe("2025-10-01 00:00:00");
	expect(periods[11]).toBe("2026-09-01 00:00:00");
});

test(`${chalk.yellowBright(
	"analytics range window: finer bins span the whole month range",
)}`, () => {
	const window = getStandardIntervalWindow({
		interval: "6m",
		binSize: "week",
		now: NOW,
	});

	expect(window?.start.toISOString()).toBe("2026-03-11T00:00:00.000Z");
});

test(`${chalk.yellowBright(
	"analytics range window: day and hour ranges keep their existing alignment",
)}`, () => {
	expect(
		getStandardIntervalWindow({
			interval: "90d",
			binSize: "day",
			now: NOW,
		})?.start.toISOString(),
	).toBe("2026-06-13T00:00:00.000Z");

	expect(
		getStandardIntervalWindow({
			interval: "24h",
			now: NOW,
		})?.start.toISOString(),
	).toBe("2026-09-10T14:00:00.000Z");

	expect(
		getStandardIntervalWindow({ interval: "1bc", now: NOW }),
	).toBeUndefined();

	// The internal endpoint accepts any interval string, so an inherited
	// Object.prototype name must not be mistaken for a month range.
	expect(
		getStandardIntervalWindow({ interval: "toString", now: NOW }),
	).toBeUndefined();
});
