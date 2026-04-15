import { describe, expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import chalk from "chalk";
import { normalizeCreateSchedulePhases } from "@/internal/billing/v2/actions/createSchedule/errors/normalizeCreateSchedulePhases";

describe(chalk.yellowBright("normalizeCreateSchedulePhases"), () => {
	describe(chalk.cyan("sorting and acceptance"), () => {
		test("sorts phases by starts_at when the first effective phase starts now", () => {
			const currentEpochMs = Date.now();
			const phases = [
				{
					starts_at: currentEpochMs + ms.days(30),
					plans: [{ plan_id: "pro" }],
				},
				{
					starts_at: currentEpochMs,
					plans: [{ plan_id: "base" }],
				},
			];

			const result = normalizeCreateSchedulePhases({
				currentEpochMs,
				phases,
			});

			expect(result.map((phase) => phase.starts_at)).toEqual([
				currentEpochMs,
				currentEpochMs + ms.days(30),
			]);
		});

		test("accepts historical phases before the current effective phase", () => {
			const currentEpochMs = 1_000_000;
			const phases = [
				{
					starts_at: currentEpochMs - ms.days(30),
					plans: [{ plan_id: "old" }],
				},
				{
					starts_at: currentEpochMs - ms.days(15),
					plans: [{ plan_id: "current" }],
				},
				{
					starts_at: currentEpochMs + ms.days(15),
					plans: [{ plan_id: "future" }],
				},
			];

			const result = normalizeCreateSchedulePhases({
				currentEpochMs,
				phases,
			});

			expect(result.map((phase) => phase.starts_at)).toEqual([
				currentEpochMs - ms.days(30),
				currentEpochMs - ms.days(15),
				currentEpochMs + ms.days(15),
			]);
		});
	});

	describe(chalk.cyan("validation errors"), () => {
		test("rejects a single phase that starts in the future", () => {
			expect(() =>
				normalizeCreateSchedulePhases({
					currentEpochMs: 1_000_000,
					phases: [
						{
							starts_at: 1_000_000 + ms.minutes(2),
							plans: [{ plan_id: "pro" }],
						},
					],
				}),
			).toThrow("The first phase must start immediately");
		});
	});
});
