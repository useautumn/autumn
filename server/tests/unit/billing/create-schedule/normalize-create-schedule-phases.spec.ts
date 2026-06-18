import { describe, expect, test } from "bun:test";
import {
	addDuration,
	type CreateScheduleParamsV0,
	ms,
	StartingAfterDuration,
} from "@autumn/shared";
import chalk from "chalk";
import {
	getInitialCreateSchedulePhase,
	normalizeCreateSchedulePhases,
} from "@/internal/billing/v2/actions/createSchedule/errors/normalizeCreateSchedulePhases";

describe(chalk.yellowBright("normalizeCreateSchedulePhases"), () => {
	test("sorts phases by starts_at", () => {
		const phases: CreateScheduleParamsV0["phases"] = [
			{
				starts_at: 2_592_001_000,
				plans: [{ plan_id: "pro" }],
			},
			{
				starts_at: 1_000,
				plans: [{ plan_id: "base" }],
			},
		];

		const result = normalizeCreateSchedulePhases({
			phases,
			currentEpochMs: 1_000,
		});

		expect(result.map((phase) => phase.starts_at)).toEqual([
			1_000, 2_592_001_000,
		]);
	});

	test("resolves now and starting_after in request order", () => {
		const currentEpochMs = Date.UTC(2026, 0, 31);
		const phase2StartsAt = addDuration({
			now: currentEpochMs,
			durationType: StartingAfterDuration.Month,
			durationLength: 2,
		});
		const phase3StartsAt = addDuration({
			now: phase2StartsAt,
			durationType: StartingAfterDuration.Year,
			durationLength: 1,
		});
		const phases: CreateScheduleParamsV0["phases"] = [
			{
				starts_at: "now",
				plans: [{ plan_id: "base" }],
			},
			{
				starting_after: {
					duration_type: StartingAfterDuration.Month,
					duration_count: 2,
				},
				plans: [{ plan_id: "pro" }],
			},
			{
				starting_after: {
					duration_type: StartingAfterDuration.Year,
					duration_count: 1,
				},
				plans: [{ plan_id: "premium" }],
			},
		];

		const result = normalizeCreateSchedulePhases({
			phases,
			currentEpochMs,
		});

		expect(result).toEqual([
			{
				starts_at: currentEpochMs,
				plans: [{ plan_id: "base" }],
			},
			{
				starts_at: phase2StartsAt,
				plans: [{ plan_id: "pro" }],
			},
			{
				starts_at: phase3StartsAt,
				plans: [{ plan_id: "premium" }],
			},
		]);
	});

	// Regression: the date picker defaults a phase to noon, so an "end of current cycle"
	// switch lands a few hours off the subscription's anchor instant. Such a phase must
	// snap to the exact cycle boundary so the new plan bills a full first period.
	test("snaps a near-boundary future phase onto the cycle boundary", () => {
		const currentEpochMs = Date.UTC(2026, 0, 14);
		const cycleBoundaryMs = currentEpochMs + ms.days(30);
		const phases: CreateScheduleParamsV0["phases"] = [
			{ starts_at: currentEpochMs, plans: [{ plan_id: "pro" }] },
			{
				starts_at: cycleBoundaryMs - ms.hours(6),
				plans: [{ plan_id: "premium" }],
			},
		];

		const result = normalizeCreateSchedulePhases({
			phases,
			currentEpochMs,
			cycleBoundaryMs,
		});

		expect(result.map((phase) => phase.starts_at)).toEqual([
			currentEpochMs,
			cycleBoundaryMs,
		]);
	});

	test("leaves a genuinely mid-cycle future phase unchanged", () => {
		const currentEpochMs = Date.UTC(2026, 0, 14);
		const cycleBoundaryMs = currentEpochMs + ms.days(30);
		const midCycleStartsAt = cycleBoundaryMs - ms.days(15);
		const phases: CreateScheduleParamsV0["phases"] = [
			{ starts_at: currentEpochMs, plans: [{ plan_id: "pro" }] },
			{ starts_at: midCycleStartsAt, plans: [{ plan_id: "premium" }] },
		];

		const result = normalizeCreateSchedulePhases({
			phases,
			currentEpochMs,
			cycleBoundaryMs,
		});

		expect(result.map((phase) => phase.starts_at)).toEqual([
			currentEpochMs,
			midCycleStartsAt,
		]);
	});

	// A deliberate `now + 30 days` phase sits a full day from the boundary on a 31-day
	// cycle; that gap must stay outside the snap window so it is never silently moved.
	test("leaves a phase a full day from the boundary unchanged", () => {
		const currentEpochMs = Date.UTC(2026, 0, 14);
		const cycleBoundaryMs = currentEpochMs + ms.days(31);
		const deliberateStartsAt = currentEpochMs + ms.days(30);
		const phases: CreateScheduleParamsV0["phases"] = [
			{ starts_at: currentEpochMs, plans: [{ plan_id: "pro" }] },
			{ starts_at: deliberateStartsAt, plans: [{ plan_id: "premium" }] },
		];

		const result = normalizeCreateSchedulePhases({
			phases,
			currentEpochMs,
			cycleBoundaryMs,
		});

		expect(result.map((phase) => phase.starts_at)).toEqual([
			currentEpochMs,
			deliberateStartsAt,
		]);
	});

	test("uses request order for initial phase when relative timing is present", () => {
		const phases: CreateScheduleParamsV0["phases"] = [
			{
				starts_at: 2_000,
				plans: [{ plan_id: "base" }],
			},
			{
				starting_after: {
					duration_type: StartingAfterDuration.Month,
					duration_count: 1,
				},
				plans: [{ plan_id: "pro" }],
			},
		];

		const initialPhase = getInitialCreateSchedulePhase({ phases });

		expect(initialPhase.plans[0]?.plan_id).toBe("base");
	});
});
