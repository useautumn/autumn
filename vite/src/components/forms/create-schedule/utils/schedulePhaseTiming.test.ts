import { describe, expect, test } from "bun:test";
import { isUnscheduledPlanSet } from "./schedulePhaseTiming";

const DAY_MS = 24 * 60 * 60 * 1000;
const nowMs = Date.UTC(2026, 9, 7);

describe("isUnscheduledPlanSet", () => {
	test("a new single phase starting now has no timing to show", () => {
		expect(
			isUnscheduledPlanSet({
				phases: [{ startsAt: null }],
				isExistingSchedule: false,
			}),
		).toBe(true);
	});

	test("a new single phase with a picked start date keeps its timing", () => {
		for (const startsAt of [nowMs - 30 * DAY_MS, nowMs + 30 * DAY_MS]) {
			expect(
				isUnscheduledPlanSet({
					phases: [{ startsAt }],
					isExistingSchedule: false,
				}),
			).toBe(false);
		}
	});

	test("a later phase makes it a schedule", () => {
		expect(
			isUnscheduledPlanSet({
				phases: [{ startsAt: null }, { startsAt: nowMs + 30 * DAY_MS }],
				isExistingSchedule: false,
			}),
		).toBe(false);
		expect(
			isUnscheduledPlanSet({
				phases: [{ startsAt: null }, { startsAt: null }],
				isExistingSchedule: false,
			}),
		).toBe(false);
	});

	test("an existing schedule keeps its timing even with one phase left", () => {
		expect(
			isUnscheduledPlanSet({
				phases: [{ startsAt: null }],
				isExistingSchedule: true,
			}),
		).toBe(false);
	});
});
