import { describe, expect, test } from "bun:test";
import {
	type DbUsageLimit,
	pickStricterUsageLimit,
	ResetInterval,
} from "@autumn/shared";

const limit = (
	value: number,
	interval: DbUsageLimit["interval"] = ResetInterval.Month,
	enabled = true,
	anchor: DbUsageLimit["anchor"] = "billing_cycle",
): DbUsageLimit => ({
	feature_id: "messages",
	enabled,
	limit: value,
	interval,
	anchor,
});

describe("pickStricterUsageLimit", () => {
	test("enabled beats disabled regardless of limit", () => {
		expect(
			pickStricterUsageLimit(limit(5, ResetInterval.Month, false), limit(1000)),
		).toMatchObject({ limit: 1000 });
		expect(
			pickStricterUsageLimit(limit(1000), limit(5, ResetInterval.Month, false)),
		).toMatchObject({ limit: 1000 });
	});

	test("same interval: lower limit wins (order-independent)", () => {
		expect(pickStricterUsageLimit(limit(5), limit(20))).toMatchObject({
			limit: 5,
		});
		expect(pickStricterUsageLimit(limit(20), limit(5))).toMatchObject({
			limit: 5,
		});
	});

	test("different intervals: lower per-day RATE wins, not lower raw limit", () => {
		const perDay = limit(100, ResetInterval.Day);
		const perMonth = limit(2000, ResetInterval.Month);
		expect(pickStricterUsageLimit(perDay, perMonth)).toBe(perMonth);
		expect(pickStricterUsageLimit(perMonth, perDay)).toBe(perMonth);
	});

	test("different intervals: the genuinely stricter daily cap wins", () => {
		const perDay = limit(10, ResetInterval.Day);
		const perMonth = limit(2000, ResetInterval.Month);
		expect(pickStricterUsageLimit(perDay, perMonth)).toBe(perDay);
	});

	test("week vs year normalize correctly", () => {
		const perWeek = limit(70, ResetInterval.Week);
		const perYear = limit(100, ResetInterval.Year);
		expect(pickStricterUsageLimit(perWeek, perYear)).toBe(perYear);
	});

	test("equal rate: utc wins over billing_cycle (order-independent)", () => {
		const utc = limit(200, ResetInterval.Day, true, "utc");
		const cycle = limit(200, ResetInterval.Day, true, "billing_cycle");
		expect(pickStricterUsageLimit(utc, cycle)).toBe(utc);
		expect(pickStricterUsageLimit(cycle, utc)).toBe(utc);
	});

	test("equal rate across DIFFERENT intervals: utc still wins", () => {
		const utcWeekly = limit(700, ResetInterval.Week, true, "utc");
		const cycleDaily = limit(100, ResetInterval.Day, true, "billing_cycle");
		expect(pickStricterUsageLimit(utcWeekly, cycleDaily)).toBe(utcWeekly);
		expect(pickStricterUsageLimit(cycleDaily, utcWeekly)).toBe(utcWeekly);
	});

	test("a stricter rate beats a utc anchor", () => {
		const utcLoose = limit(1000, ResetInterval.Day, true, "utc");
		const cycleTight = limit(5, ResetInterval.Day, true, "billing_cycle");
		expect(pickStricterUsageLimit(utcLoose, cycleTight)).toBe(cycleTight);
		expect(pickStricterUsageLimit(cycleTight, utcLoose)).toBe(cycleTight);
	});

	test("disabled still loses to a utc anchor", () => {
		const utcDisabled = limit(5, ResetInterval.Day, false, "utc");
		const cycleEnabled = limit(1000, ResetInterval.Day, true, "billing_cycle");
		expect(pickStricterUsageLimit(utcDisabled, cycleEnabled)).toBe(
			cycleEnabled,
		);
		expect(pickStricterUsageLimit(cycleEnabled, utcDisabled)).toBe(
			cycleEnabled,
		);
	});

	test("legacy rows without an anchor read as billing_cycle", () => {
		const legacy = { ...limit(200, ResetInterval.Day) } as DbUsageLimit;
		delete (legacy as Partial<DbUsageLimit>).anchor;
		const utc = limit(200, ResetInterval.Day, true, "utc");
		expect(pickStricterUsageLimit(legacy, utc)).toBe(utc);
		expect(pickStricterUsageLimit(utc, legacy)).toBe(utc);
	});
});
