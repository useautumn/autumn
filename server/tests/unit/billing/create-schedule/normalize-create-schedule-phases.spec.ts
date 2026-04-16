import { describe, expect, test } from "bun:test";
import type { CreateScheduleParamsV0 } from "@autumn/shared";
import chalk from "chalk";
import { normalizeCreateSchedulePhases } from "@/internal/billing/v2/actions/createSchedule/errors/normalizeCreateSchedulePhases";

describe(chalk.yellowBright("normalizeCreateSchedulePhases"), () => {
	test("sorts phases by starts_at", () => {
		const phases = [
			{
				starts_at: 2_592_001_000,
				plans: [{ plan_id: "pro" }],
			},
			{
				starts_at: 1_000,
				plans: [{ plan_id: "base" }],
			},
		] as CreateScheduleParamsV0["phases"];

		const result = normalizeCreateSchedulePhases({
			phases,
		});

		expect(result.map((phase) => phase.starts_at)).toEqual([
			1_000, 2_592_001_000,
		]);
	});
});
