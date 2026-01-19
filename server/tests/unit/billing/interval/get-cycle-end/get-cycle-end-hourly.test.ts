import { describe, expect, test } from "bun:test";
import { EntInterval, getCycleEnd } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

describe("get-cycle-end-hourly: hourly intervals", () => {
	describe("anchor in the past", () => {
		// Basic
		test("anchor: 10:00, now: 11:30 -> 12:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 11,
				minute: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(12);
			expect(minute).toBe(0);
		});

		test("anchor: 10:00, now: 10:30 -> 11:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(11);
			expect(minute).toBe(0);
		});

		// intervalCount > 1
		test("(intervalCount = 2) anchor: 10:00, now: 11:30 -> 12:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 11,
				minute: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 2,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(12);
			expect(minute).toBe(0);
		});

		test("(intervalCount = 3) anchor: 10:00, now: 12:30 -> 13:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 12,
				minute: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 3,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(13);
			expect(minute).toBe(0);
		});

		test("(intervalCount = 4) anchor: 10:00, now: 15:30 -> 18:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 15,
				minute: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 4,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(18);
			expect(minute).toBe(0);
		});

		// Edge cases
		test("anchor: 10:00:00, now: 10:59:30 -> 11:00:00 (just before cycle end)", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
				second: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 59,
				second: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(11);
			expect(minute).toBe(0);
		});

		test("anchor: 10:00:00, now: 11:00:30 -> 12:00:00 (just after cycle end)", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
				second: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 11,
				minute: 0,
				second: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(12);
			expect(minute).toBe(0);
		});

		test("anchor: 23:00, now: 00:30 (next day) -> 01:00 (crossing midnight)", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 23,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 16,
				hour: 0,
				minute: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(16);
			expect(hour).toBe(1);
			expect(minute).toBe(0);
		});

		test("anchor: 22:00, now: 01:30 (next day) -> 02:00 (multiple hours past midnight)", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 22,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 16,
				hour: 1,
				minute: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(16);
			expect(hour).toBe(2);
			expect(minute).toBe(0);
		});
	});

	describe("anchor in the future", () => {
		// Basic
		test("anchor: 15:00, now: 10:00 -> 11:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 15,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(11);
			expect(minute).toBe(0);
		});

		test("anchor: 20:00, now: 18:00 -> 19:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 20,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 18,
				minute: 0,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(19);
			expect(minute).toBe(0);
		});

		// intervalCount > 1
		test("(intervalCount = 2) anchor: 15:00, now: 10:00 -> 11:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 15,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 2,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(11);
			expect(minute).toBe(0);
		});

		test("(intervalCount = 3) anchor: 18:00, now: 10:00 -> 12:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 18,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 10,
				minute: 0,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 3,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(12);
			expect(minute).toBe(0);
		});

		// Edge cases
		test("anchor: 15:00:00, now: 14:59:30 -> 15:00:00 (just before anchor)", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 15,
				minute: 0,
				second: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 14,
				minute: 59,
				second: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(15);
			expect(hour).toBe(15);
			expect(minute).toBe(0);
		});

		test("anchor: 00:00 (tomorrow), now: 23:30 (today) -> 00:00 (tomorrow)", () => {
			const anchor = toUnix({
				year: 2025,
				month: 1,
				day: 16,
				hour: 0,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 15,
				hour: 23,
				minute: 30,
			});
			const result = getCycleEnd({
				anchor,
				interval: EntInterval.Hour,
				intervalCount: 1,
				now,
			});

			const { day, hour, minute } = fromUnix(result);
			expect(day).toBe(16);
			expect(hour).toBe(0);
			expect(minute).toBe(0);
		});
	});
});
