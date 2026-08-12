import { describe, expect, test } from "bun:test";
import {
	FORK_RECYCLE_DEFAULTS,
	isWithinHourlyBlackout,
	msUntilHourlyBlackoutEnd,
	rollEligibilityDelayMs,
} from "@/utils/memory/forkRecycling/recyclePolicy.js";

const MB = 1024 * 1024;
const at = (minute: number, second = 0, ms = 0) =>
	Date.UTC(2026, 7, 10, 15, minute, second, ms);

describe("recycle eligibility delay", () => {
	test("threshold default raised to 2000MB", () => {
		expect(FORK_RECYCLE_DEFAULTS.rssThresholdBytes).toBe(2000 * MB);
		expect(FORK_RECYCLE_DEFAULTS.maxDelayMs).toBe(5 * 60_000);
	});

	test("roll spans 0 to maxDelayMs", () => {
		expect(
			rollEligibilityDelayMs({ maxDelayMs: 300_000, random: () => 0 }),
		).toBe(0);
		expect(
			rollEligibilityDelayMs({ maxDelayMs: 300_000, random: () => 1 }),
		).toBe(300_000);
		for (let i = 0; i < 200; i++) {
			const rolled = rollEligibilityDelayMs({ maxDelayMs: 300_000 });
			expect(rolled).toBeGreaterThanOrEqual(0);
			expect(rolled).toBeLessThanOrEqual(300_000);
		}
	});
});

describe("isWithinHourlyBlackout", () => {
	const blackout = { beforeMs: 2 * 60_000, afterMs: 3 * 60_000 };

	test("mid-hour is clear", () => {
		expect(isWithinHourlyBlackout({ now: at(30), ...blackout })).toBe(false);
	});

	test("window opens 2min before the hour", () => {
		expect(isWithinHourlyBlackout({ now: at(57, 59, 999), ...blackout })).toBe(
			false,
		);
		expect(isWithinHourlyBlackout({ now: at(58), ...blackout })).toBe(true);
		expect(isWithinHourlyBlackout({ now: at(59, 59, 999), ...blackout })).toBe(
			true,
		);
	});

	test("window closes 3min after the hour", () => {
		expect(isWithinHourlyBlackout({ now: at(0), ...blackout })).toBe(true);
		expect(isWithinHourlyBlackout({ now: at(2, 59, 999), ...blackout })).toBe(
			true,
		);
		expect(isWithinHourlyBlackout({ now: at(3), ...blackout })).toBe(false);
	});

	test("zero widths disable the blackout", () => {
		expect(
			isWithinHourlyBlackout({ now: at(0), beforeMs: 0, afterMs: 0 }),
		).toBe(false);
		expect(
			isWithinHourlyBlackout({ now: at(59), beforeMs: 0, afterMs: 0 }),
		).toBe(false);
	});
});

describe("msUntilHourlyBlackoutEnd", () => {
	const blackout = { beforeMs: 2 * 60_000, afterMs: 3 * 60_000 };

	test("zero when clear of the window", () => {
		expect(msUntilHourlyBlackoutEnd({ now: at(30), ...blackout })).toBe(0);
		expect(msUntilHourlyBlackoutEnd({ now: at(3), ...blackout })).toBe(0);
	});

	test("counts down to the post-hour exit from inside the tail", () => {
		expect(msUntilHourlyBlackoutEnd({ now: at(0), ...blackout })).toBe(
			3 * 60_000,
		);
		expect(msUntilHourlyBlackoutEnd({ now: at(1), ...blackout })).toBe(
			2 * 60_000,
		);
	});

	test("spans the hour boundary from the pre-hour side", () => {
		expect(msUntilHourlyBlackoutEnd({ now: at(58), ...blackout })).toBe(
			5 * 60_000,
		);
		expect(msUntilHourlyBlackoutEnd({ now: at(59), ...blackout })).toBe(
			4 * 60_000,
		);
	});
});
