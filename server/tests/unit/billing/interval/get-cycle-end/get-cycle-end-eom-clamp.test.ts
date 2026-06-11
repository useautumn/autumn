import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleEnd, getCycleStart } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

/**
 * TDD test for the date-fns clamp-shave bug: when `now` sits on a clamped
 * end-of-month boundary 2+ cycles from the anchor, differenceInMonths
 * under-counts by one (e.g. differenceInMonths(Apr 30, Jan 31) === 2, not 3),
 * and getCycleEnd's single overshoot correction cannot recover.
 *
 * Red-failure mode (pre-fix): for a few hours after the clamped boundary,
 * getCycleEnd returns the boundary itself — a cycle end AT OR BEFORE `now`.
 *
 * Green-success criteria: getCycleEnd is always strictly after `now`, and
 * [getCycleStart, getCycleEnd) always brackets `now`.
 *
 * date-fns special-cases the 1-month clamp (isLastDayOfMonth && difference
 * === 1), which the existing "31 Mar -> 30 Apr 12:01" tests exercise; these
 * tests pin the multi-month clamps that the special case does not cover.
 *
 * Test suite (anchor 31 Jan 2026 10:00 unless noted):
 * 1. now 30 Apr 09:00 (before boundary) -> 30 Apr 10:00 (control, passes pre-fix)
 * 2. now 30 Apr 10:00 (boundary instant) -> 31 May 10:00
 * 3. now 30 Apr 11:00 (after boundary)   -> 31 May 10:00
 * 4. (intervalCount = 3) now 30 Apr 11:00 -> 31 Jul 10:00
 * 5. anchor 31 Mar 12:00, now 30 Jun 12:01 (3 clamped months) -> 31 Jul 12:00
 * 6. annual leap anchor 29 Feb 2024, now 28 Feb 2025 22:00 -> 28 Feb 2026
 * 7. invariant: start <= now < end across the clamped boundary day
 */
describe("get-cycle-end-eom-clamp: clamped EOM boundary 2+ cycles from anchor", () => {
	const anchor = toUnix({ year: 2026, month: 1, day: 31, hour: 10 });

	test("anchor: 31 Jan 10:00, now: 30 Apr 09:00 -> end of cycle should be 30 Apr 10:00", () => {
		const now = toUnix({ year: 2026, month: 4, day: 30, hour: 9 });
		const result = getCycleEnd({
			anchor,
			interval: BillingInterval.Month,
			intervalCount: 1,
			now,
		});

		const { month, day, hour } = fromUnix(result);
		expect(month).toBe(4);
		expect(day).toBe(30);
		expect(hour).toBe(10);
	});

	test("anchor: 31 Jan 10:00, now: 30 Apr 10:00 (boundary instant) -> end of cycle should be 31 May 10:00", () => {
		const now = toUnix({ year: 2026, month: 4, day: 30, hour: 10 });
		const result = getCycleEnd({
			anchor,
			interval: BillingInterval.Month,
			intervalCount: 1,
			now,
		});

		const { month, day, hour } = fromUnix(result);
		expect(month).toBe(5);
		expect(day).toBe(31);
		expect(hour).toBe(10);
		expect(result).toBeGreaterThan(now);
	});

	test("anchor: 31 Jan 10:00, now: 30 Apr 11:00 -> end of cycle should be 31 May 10:00", () => {
		const now = toUnix({ year: 2026, month: 4, day: 30, hour: 11 });
		const result = getCycleEnd({
			anchor,
			interval: BillingInterval.Month,
			intervalCount: 1,
			now,
		});

		const { month, day, hour } = fromUnix(result);
		expect(month).toBe(5);
		expect(day).toBe(31);
		expect(hour).toBe(10);
		expect(result).toBeGreaterThan(now);
	});

	test("(intervalCount = 3) anchor: 31 Jan 10:00, now: 30 Apr 11:00 -> end of cycle should be 31 Jul 10:00", () => {
		const now = toUnix({ year: 2026, month: 4, day: 30, hour: 11 });
		const result = getCycleEnd({
			anchor,
			interval: BillingInterval.Month,
			intervalCount: 3,
			now,
		});

		const { month, day, hour } = fromUnix(result);
		expect(month).toBe(7);
		expect(day).toBe(31);
		expect(hour).toBe(10);
		expect(result).toBeGreaterThan(now);
	});

	test("anchor: 31 Mar 12:00, now: 30 Jun 12:01 (3 clamped months) -> end of cycle should be 31 Jul 12:00", () => {
		const marchAnchor = toUnix({ year: 2026, month: 3, day: 31, hour: 12 });
		const now = toUnix({
			year: 2026,
			month: 6,
			day: 30,
			hour: 12,
			minute: 1,
		});
		const result = getCycleEnd({
			anchor: marchAnchor,
			interval: BillingInterval.Month,
			intervalCount: 1,
			now,
		});

		const { month, day, hour } = fromUnix(result);
		expect(month).toBe(7);
		expect(day).toBe(31);
		expect(hour).toBe(12);
		expect(result).toBeGreaterThan(now);
	});

	test("annual, leap anchor: 29 Feb 2024 12:00, now: 28 Feb 2025 22:00 -> end of cycle should be 28 Feb 2026 12:00", () => {
		const leapAnchor = toUnix({ year: 2024, month: 2, day: 29, hour: 12 });
		const now = toUnix({ year: 2025, month: 2, day: 28, hour: 22 });
		const result = getCycleEnd({
			anchor: leapAnchor,
			interval: BillingInterval.Year,
			intervalCount: 1,
			now,
		});

		const { year, month, day, hour } = fromUnix(result);
		expect(year).toBe(2026);
		expect(month).toBe(2);
		expect(day).toBe(28);
		expect(hour).toBe(12);
		expect(result).toBeGreaterThan(now);
	});

	test("invariant: cycleStart <= now < cycleEnd across the clamped boundary day", () => {
		const nows = [
			toUnix({ year: 2026, month: 4, day: 30, hour: 9 }),
			toUnix({ year: 2026, month: 4, day: 30, hour: 10 }),
			toUnix({ year: 2026, month: 4, day: 30, hour: 11 }),
			toUnix({ year: 2026, month: 4, day: 30, hour: 23, minute: 59 }),
			toUnix({ year: 2026, month: 5, day: 1, hour: 0, minute: 1 }),
		];

		for (const now of nows) {
			const start = getCycleStart({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});
			const end = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});
			expect(start).toBeLessThanOrEqual(now);
			expect(end).toBeGreaterThan(now);
		}
	});
});
