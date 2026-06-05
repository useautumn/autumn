// Day buckets are emitted by the pipe in the viewer's local zone, so the chart
// label must read the bare string as local, not UTC (else it lands a day behind
// for non-UTC viewers). These assertions are timezone-independent so they pass
// under any CI runner zone.
// Ref: tickets/ANALYTICS_TIMEZONE_BUCKET_OFFSET.md

import { expect, test } from "bun:test";
import {
	formatPeriodLabel,
	parseLocalTimestamp,
	parseUTCTimestamp,
} from "@/views/customers/customer/analytics/utils/parseTimestamp";

test("day bucket label round-trips the local calendar day in any timezone", () => {
	// parseLocalTimestamp parses local and formatDateShort renders local, so the
	// wall-clock day round-trips regardless of the runner's zone. Before the fix
	// (parse-as-UTC) this was a day behind for west-of-UTC viewers.
	const label = formatPeriodLabel({
		period: "2026-06-04 00:00:00",
		interval: "30d",
	});
	expect(label).toBe("4 Jun");
});

test("parseLocalTimestamp keeps the bare string's wall-clock as local", () => {
	const date = parseLocalTimestamp("2026-06-04 13:00:00");
	expect(date.getFullYear()).toBe(2026);
	expect(date.getMonth()).toBe(5); // June (0-indexed)
	expect(date.getDate()).toBe(4);
	expect(date.getHours()).toBe(13);
});

test("parseUTCTimestamp still treats bare strings as UTC (hour view / raw events)", () => {
	// Hour buckets and the raw-events table are genuine UTC and must not change.
	const date = parseUTCTimestamp("2026-06-04 13:00:00");
	expect(date.getUTCFullYear()).toBe(2026);
	expect(date.getUTCMonth()).toBe(5);
	expect(date.getUTCDate()).toBe(4);
	expect(date.getUTCHours()).toBe(13);
});
