import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleStart } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

/**
 * TDD test for the date-fns clamp-shave bug: when `now` sits on a clamped
 * end-of-month boundary 2+ cycles from the anchor, differenceInMonths
 * under-counts by one (e.g. differenceInMonths(Apr 30, Jan 31) === 2, not 3).
 *
 * Red-failure mode (pre-fix): getCycleStart only corrects overshoot
 * (estimate > now), never undershoot, so for the rest of the clamped
 * boundary day it returns the PREVIOUS cycle's start (one cycle stale).
 *
 * Green-success criteria: getCycleStart returns the latest boundary <= now.
 *
 * Test suite (anchor 31 Jan 2026 10:00):
 * 1. now 30 Apr 09:00 (before boundary) -> 31 Mar 10:00 (control, passes pre-fix)
 * 2. now 30 Apr 10:00 (boundary instant) -> 30 Apr 10:00
 * 3. now 30 Apr 11:00 (after boundary)   -> 30 Apr 10:00
 * 4. annual leap anchor 29 Feb 2024, now 28 Feb 2025 22:00 -> 28 Feb 2025
 * 5. (intervalCount = 3) now 30 Apr 11:00 -> 30 Apr 10:00 (clamped quarter boundary)
 */
describe("get-cycle-start-eom-clamp: clamped EOM boundary 2+ cycles from anchor", () => {
	const anchor = toUnix({ year: 2026, month: 1, day: 31, hour: 10 });

	test("anchor: 31 Jan 10:00, now: 30 Apr 09:00 -> cycle start should be 31 Mar 10:00", () => {
		const now = toUnix({ year: 2026, month: 4, day: 30, hour: 9 });
		const result = getCycleStart({
			anchor,
			interval: BillingInterval.Month,
			intervalCount: 1,
			now,
		});

		const { month, day, hour } = fromUnix(result);
		expect(month).toBe(3);
		expect(day).toBe(31);
		expect(hour).toBe(10);
	});

	test("anchor: 31 Jan 10:00, now: 30 Apr 10:00 (boundary instant) -> cycle start should be 30 Apr 10:00", () => {
		const now = toUnix({ year: 2026, month: 4, day: 30, hour: 10 });
		const result = getCycleStart({
			anchor,
			interval: BillingInterval.Month,
			intervalCount: 1,
			now,
		});

		const { month, day, hour } = fromUnix(result);
		expect(month).toBe(4);
		expect(day).toBe(30);
		expect(hour).toBe(10);
		expect(result).toBeLessThanOrEqual(now);
	});

	test("anchor: 31 Jan 10:00, now: 30 Apr 11:00 -> cycle start should be 30 Apr 10:00", () => {
		const now = toUnix({ year: 2026, month: 4, day: 30, hour: 11 });
		const result = getCycleStart({
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

	test("annual, leap anchor: 29 Feb 2024 12:00, now: 28 Feb 2025 22:00 -> cycle start should be 28 Feb 2025 12:00", () => {
		const leapAnchor = toUnix({ year: 2024, month: 2, day: 29, hour: 12 });
		const now = toUnix({ year: 2025, month: 2, day: 28, hour: 22 });
		const result = getCycleStart({
			anchor: leapAnchor,
			interval: BillingInterval.Year,
			intervalCount: 1,
			now,
		});

		const { year, month, day, hour } = fromUnix(result);
		expect(year).toBe(2025);
		expect(month).toBe(2);
		expect(day).toBe(28);
		expect(hour).toBe(12);
		expect(result).toBeLessThanOrEqual(now);
	});

	test("(intervalCount = 3) anchor: 31 Jan 10:00, now: 30 Apr 11:00 -> cycle start should be 30 Apr 10:00", () => {
		const now = toUnix({ year: 2026, month: 4, day: 30, hour: 11 });
		const result = getCycleStart({
			anchor,
			interval: BillingInterval.Month,
			intervalCount: 3,
			now,
		});

		const { month, day, hour } = fromUnix(result);
		expect(month).toBe(4);
		expect(day).toBe(30);
		expect(hour).toBe(10);
	});
});
