// The deductions pipe only emits buckets it has rows for; the period grid comes
// from the events aggregation beside it, which is zero-filled over the same window.

import { expect, test } from "bun:test";
import { fillMissingPeriods } from "@/views/customers/customer/analytics/utils/fillMissingPeriods";

const gridPeriods = [
	"2026-08-20 00:00:00",
	"2026-08-21 00:00:00",
	"2026-08-22 00:00:00",
];

test("inserts zero rows for grid periods the deductions are missing", () => {
	const result = fillMissingPeriods({
		events: {
			meta: [{ name: "period" }, { name: "ai_credits__chat" }],
			rows: 1,
			data: [{ period: "2026-08-22 00:00:00", ai_credits__chat: 12 }],
		},
		periods: gridPeriods,
	});

	expect(result.data).toEqual([
		{ period: "2026-08-20 00:00:00", ai_credits__chat: 0 },
		{ period: "2026-08-21 00:00:00", ai_credits__chat: 0 },
		{ period: "2026-08-22 00:00:00", ai_credits__chat: 12 },
	]);
	expect(result.rows).toBe(3);
});

test("returns the same object when every grid period is already present", () => {
	const events = {
		meta: [{ name: "period" }, { name: "ai_credits__chat" }],
		rows: 3,
		data: gridPeriods.map((period) => ({ period, ai_credits__chat: 1 })),
	};

	expect(fillMissingPeriods({ events, periods: gridPeriods })).toBe(events);
});

test("keeps periods outside the grid rather than dropping them", () => {
	const result = fillMissingPeriods({
		events: {
			meta: [{ name: "period" }, { name: "ai_credits__chat" }],
			rows: 1,
			data: [{ period: "2026-08-19 00:00:00", ai_credits__chat: 4 }],
		},
		periods: gridPeriods,
	});

	expect(result.data.map((row) => row.period)).toEqual([
		"2026-08-19 00:00:00",
		...gridPeriods,
	]);
});
