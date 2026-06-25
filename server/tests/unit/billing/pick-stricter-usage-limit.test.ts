/**
 * pickStricterUsageLimit: the multi-plan collapse comparator for usage_limits.
 * Same interval -> lower limit wins. Different intervals -> lower per-day rate
 * wins (the resolver enforces a single window per feature, so the genuinely
 * stricter effective cap must be chosen, not the lower raw number).
 */

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
): DbUsageLimit => ({
	feature_id: "messages",
	enabled,
	limit: value,
	interval,
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
		// 100/day = 100/day rate; 2000/month ≈ 66.7/day rate. The monthly cap is
		// stricter despite the larger raw number — raw comparison would be wrong.
		const perDay = limit(100, ResetInterval.Day);
		const perMonth = limit(2000, ResetInterval.Month);
		expect(pickStricterUsageLimit(perDay, perMonth)).toBe(perMonth);
		expect(pickStricterUsageLimit(perMonth, perDay)).toBe(perMonth);
	});

	test("different intervals: the genuinely stricter daily cap wins", () => {
		// 10/day = 10/day; 2000/month ≈ 66.7/day -> the daily cap is stricter.
		const perDay = limit(10, ResetInterval.Day);
		const perMonth = limit(2000, ResetInterval.Month);
		expect(pickStricterUsageLimit(perDay, perMonth)).toBe(perDay);
	});

	test("week vs year normalize correctly", () => {
		// 70/week = 10/day; 100/year ≈ 0.27/day -> yearly is far stricter.
		const perWeek = limit(70, ResetInterval.Week);
		const perYear = limit(100, ResetInterval.Year);
		expect(pickStricterUsageLimit(perWeek, perYear)).toBe(perYear);
	});
});
