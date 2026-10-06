import { expect, test } from "bun:test";
import { baselineIsDue, isBaselineSkipDay } from "./scheduleBaselineRuns.ts";

const HOUR_MS = 60 * 60 * 1000;
const now = new Date("2026-10-01T12:00:00Z").getTime();

test("a first baseline is due when none has run", () => {
	expect(baselineIsDue({ lastCreatedAt: undefined, now })).toBe(true);
});

test("a baseline is not due again within 24h, even after dev moves", () => {
	const lastCreatedAt = new Date(now - 7 * HOUR_MS);
	expect(baselineIsDue({ lastCreatedAt, now })).toBe(false);
});

test("a baseline is due once the last one is more than 24h old", () => {
	const lastCreatedAt = new Date(now - 25 * HOUR_MS);
	expect(baselineIsDue({ lastCreatedAt, now })).toBe(true);
});

test("a baseline exactly 24h old is not due yet; one just past it is", () => {
	expect(
		baselineIsDue({ lastCreatedAt: new Date(now - 24 * HOUR_MS), now }),
	).toBe(false);
	expect(
		baselineIsDue({ lastCreatedAt: new Date(now - 24 * HOUR_MS - 1), now }),
	).toBe(true);
});

const at = (iso: string) => new Date(iso).getTime();

test("weekends are skipped by default, judged in UTC", () => {
	const skipDays = "sat,sun";
	expect(isBaselineSkipDay({ now: at("2026-10-10T00:30:00Z"), skipDays })).toBe(
		true,
	);
	expect(isBaselineSkipDay({ now: at("2026-10-11T23:59:59Z"), skipDays })).toBe(
		true,
	);
	expect(isBaselineSkipDay({ now: at("2026-10-09T23:59:59Z"), skipDays })).toBe(
		false,
	);
	expect(isBaselineSkipDay({ now: at("2026-10-12T00:00:00Z"), skipDays })).toBe(
		false,
	);
});

test("skip days are configurable, case- and spacing-insensitive, and accept full names", () => {
	const friday = at("2026-10-09T12:00:00Z");
	expect(isBaselineSkipDay({ now: friday, skipDays: " Fri , sat" })).toBe(true);
	expect(isBaselineSkipDay({ now: friday, skipDays: "friday" })).toBe(true);
	expect(isBaselineSkipDay({ now: friday, skipDays: "sat,sun" })).toBe(false);
});

test("a blank list skips no day", () => {
	expect(
		isBaselineSkipDay({ now: at("2026-10-10T12:00:00Z"), skipDays: "" }),
	).toBe(false);
});
