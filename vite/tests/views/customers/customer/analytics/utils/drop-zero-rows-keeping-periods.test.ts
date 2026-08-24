// The server zero-fills every period in the window, so the count of periods it
// returns is the x-axis the chart must render — dropping zeros must not shrink it.

import { expect, test } from "bun:test";
import { dropZeroRowsKeepingPeriods } from "@/views/customers/customer/analytics/utils/dropZeroRowsKeepingPeriods";

const ungroupedEvents = {
	meta: [{ name: "period" }, { name: "ai_credits_count" }],
	rows: 3,
	data: [
		{ period: "2026-08-20 00:00:00", ai_credits_count: 0 },
		{ period: "2026-08-21 00:00:00", ai_credits_count: 0 },
		{ period: "2026-08-22 00:00:00", ai_credits_count: 42 },
	],
};

test("keeps idle periods as zero rows", () => {
	const result = dropZeroRowsKeepingPeriods({
		events: ungroupedEvents,
		groupColumn: null,
	});

	expect(result.data.map((row) => row.period)).toEqual([
		"2026-08-20 00:00:00",
		"2026-08-21 00:00:00",
		"2026-08-22 00:00:00",
	]);
	expect(result.rows).toBe(3);
});

test("drops zero group rows but keeps one placeholder for an idle period", () => {
	const result = dropZeroRowsKeepingPeriods({
		events: {
			meta: [
				{ name: "period" },
				{ name: "customer_id" },
				{ name: "ai_credits_count" },
			],
			rows: 4,
			data: [
				{
					period: "2026-08-20 00:00:00",
					customer_id: "a",
					ai_credits_count: 0,
				},
				{
					period: "2026-08-20 00:00:00",
					customer_id: "b",
					ai_credits_count: 0,
				},
				{
					period: "2026-08-21 00:00:00",
					customer_id: "a",
					ai_credits_count: 7,
				},
				{
					period: "2026-08-21 00:00:00",
					customer_id: "b",
					ai_credits_count: 0,
				},
			],
		},
		groupColumn: "customer_id",
	});

	expect(result.data).toEqual([
		{ period: "2026-08-20 00:00:00", customer_id: "a", ai_credits_count: 0 },
		{ period: "2026-08-21 00:00:00", customer_id: "a", ai_credits_count: 7 },
	]);
});

test("keeps periods in chronological order when the idle ones come last", () => {
	const result = dropZeroRowsKeepingPeriods({
		events: {
			meta: [{ name: "period" }, { name: "ai_credits_count" }],
			rows: 3,
			data: [
				{ period: "2026-08-20 00:00:00", ai_credits_count: 5 },
				{ period: "2026-08-21 00:00:00", ai_credits_count: 0 },
				{ period: "2026-08-22 00:00:00", ai_credits_count: 9 },
			],
		},
		groupColumn: null,
	});

	expect(result.data.map((row) => row.ai_credits_count)).toEqual([5, 0, 9]);
});

test("returns no rows when the whole range is empty, so the empty state stays", () => {
	const result = dropZeroRowsKeepingPeriods({
		events: {
			meta: [{ name: "period" }, { name: "ai_credits_count" }],
			rows: 2,
			data: [
				{ period: "2026-08-20 00:00:00", ai_credits_count: 0 },
				{ period: "2026-08-21 00:00:00", ai_credits_count: 0 },
			],
		},
		groupColumn: null,
	});

	expect(result.data).toEqual([]);
	expect(result.rows).toBe(0);
});

test("returns the same object when nothing was dropped", () => {
	const events = {
		meta: [{ name: "period" }, { name: "ai_credits_count" }],
		rows: 1,
		data: [{ period: "2026-08-20 00:00:00", ai_credits_count: 3 }],
	};

	expect(dropZeroRowsKeepingPeriods({ events, groupColumn: null })).toBe(
		events,
	);
});
