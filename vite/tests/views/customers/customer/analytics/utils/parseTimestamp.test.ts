import { expect, test } from "bun:test";
import {
	formatPeriodLabel,
	parseLocalTimestamp,
	parseUTCTimestamp,
} from "@/views/customers/customer/analytics/utils/parseTimestamp";

test("day bucket label round-trips the local calendar day in any timezone", () => {
	const label = formatPeriodLabel({
		period: "2026-06-04 00:00:00",
		interval: "30d",
	});
	expect(label).toBe("4 Jun");
});

test("parseLocalTimestamp keeps the bare string's wall-clock as local", () => {
	const date = parseLocalTimestamp("2026-06-04 13:00:00");
	expect(date.getFullYear()).toBe(2026);
	expect(date.getMonth()).toBe(5);
	expect(date.getDate()).toBe(4);
	expect(date.getHours()).toBe(13);
});

test("parseUTCTimestamp still treats bare strings as UTC (hour view / raw events)", () => {
	const date = parseUTCTimestamp("2026-06-04 13:00:00");
	expect(date.getUTCFullYear()).toBe(2026);
	expect(date.getUTCMonth()).toBe(5);
	expect(date.getUTCDate()).toBe(4);
	expect(date.getUTCHours()).toBe(13);
});
