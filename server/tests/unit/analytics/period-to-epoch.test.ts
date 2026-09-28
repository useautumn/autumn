// events.aggregate returns bucket starts as real instants, so a day bucket in a
// non-UTC zone must not be read as UTC wall-clock time.
import { expect, test } from "bun:test";
import { periodToEpoch } from "@/internal/events/eventUtils.js";

test.each([
	{
		name: "UTC day bucket",
		period: "2026-09-14 00:00:00",
		timezone: "UTC",
		binSize: "day",
		expected: Date.UTC(2026, 8, 14),
	},
	{
		name: "day bucket in a half-hour offset zone",
		period: "2026-09-14 00:00:00",
		timezone: "Asia/Kolkata",
		binSize: "day",
		expected: Date.UTC(2026, 8, 13, 18, 30),
	},
	{
		name: "day bucket across a DST offset",
		period: "2026-07-01 00:00:00",
		timezone: "America/New_York",
		binSize: "day",
		expected: Date.UTC(2026, 6, 1, 4),
	},
	{
		name: "hour bucket stays UTC whatever the zone",
		period: "2026-09-14 05:00:00",
		timezone: "Asia/Kolkata",
		binSize: "hour",
		expected: Date.UTC(2026, 8, 14, 5),
	},
])("periodToEpoch: $name", ({ period, timezone, binSize, expected }) => {
	expect(periodToEpoch({ period, timezone, binSize })).toBe(expected);
});
