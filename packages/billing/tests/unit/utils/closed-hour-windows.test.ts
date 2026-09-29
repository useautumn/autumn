import { describe, expect, test } from "bun:test";
import { closedHourWindows } from "../../../src/utils/closedHourWindows";

const at = (iso: string) => Date.parse(iso);

describe("closedHourWindows", () => {
	test("12:15 → the three whole hours ending at 12:00, oldest first", () => {
		expect(
			closedHourWindows({ nowMs: at("2026-09-27T12:15:00Z"), count: 3 }),
		).toEqual([
			{
				startMs: at("2026-09-27T09:00:00Z"),
				endMs: at("2026-09-27T10:00:00Z"),
			},
			{
				startMs: at("2026-09-27T10:00:00Z"),
				endMs: at("2026-09-27T11:00:00Z"),
			},
			{
				startMs: at("2026-09-27T11:00:00Z"),
				endMs: at("2026-09-27T12:00:00Z"),
			},
		]);
	});

	test("exactly on the hour counts that hour as closed", () => {
		expect(
			closedHourWindows({ nowMs: at("2026-09-27T12:00:00Z"), count: 1 }),
		).toEqual([
			{
				startMs: at("2026-09-27T11:00:00Z"),
				endMs: at("2026-09-27T12:00:00Z"),
			},
		]);
	});

	test("crosses midnight", () => {
		expect(
			closedHourWindows({ nowMs: at("2026-10-01T00:15:00Z"), count: 2 }),
		).toEqual([
			{
				startMs: at("2026-09-30T22:00:00Z"),
				endMs: at("2026-09-30T23:00:00Z"),
			},
			{
				startMs: at("2026-09-30T23:00:00Z"),
				endMs: at("2026-10-01T00:00:00Z"),
			},
		]);
	});
});
