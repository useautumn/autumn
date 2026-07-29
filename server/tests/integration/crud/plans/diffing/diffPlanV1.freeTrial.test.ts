import { AppEnv, type ApiPlanV1, FreeTrialDuration } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { applyDiff } from "@autumn/shared/utils/planV1Utils/diff/applyDiff.js";
import { diffPlanV1 } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";

const makePlan = (overrides?: Partial<ApiPlanV1>): ApiPlanV1 => ({
	id: "test-plan",
	name: "Test Plan",
	description: null,
	group: null,
	version: 1,
	add_on: false,
	auto_enable: false,
	price: null,
	items: [
		{
			feature_id: "messages",
			included: 0,
			unlimited: false,
			reset: null,
			price: null,
		},
	],
	created_at: 0,
	env: AppEnv.Sandbox,
	archived: false,
	base_variant_id: null,
	config: { ignore_past_due: false },
	metadata: {},
	...overrides,
});

describe("diffPlanV1 + applyDiff — free_trial branch", () => {
	test("adding a trial produces a diff and apply reconstructs it", () => {
		const trial = {
			duration_length: 14,
			duration_type: FreeTrialDuration.Day,
			card_required: false,
		};
		const from = makePlan({ free_trial: undefined });
		const to = makePlan({ free_trial: trial });

		const diff = diffPlanV1({ from, to });
		expect(diff.free_trial).toEqual(trial);

		const result = applyDiff({ base: from, diff });
		expect(result.free_trial).toEqual(trial);
	});

	test("removing a trial produces a null diff and apply drops it", () => {
		const trial = {
			duration_length: 7,
			duration_type: FreeTrialDuration.Day,
			card_required: true,
		};
		const from = makePlan({ free_trial: trial });
		const to = makePlan({ free_trial: undefined });

		const diff = diffPlanV1({ from, to });
		expect(diff.free_trial).toBeNull();

		const result = applyDiff({ base: from, diff });
		expect(result.free_trial).toBeUndefined();
	});

	test("changing a trial duration produces a diff and apply updates it", () => {
		const fromTrial = {
			duration_length: 7,
			duration_type: FreeTrialDuration.Day,
			card_required: true,
		};
		const toTrial = {
			duration_length: 30,
			duration_type: FreeTrialDuration.Day,
			card_required: true,
		};
		const from = makePlan({ free_trial: fromTrial });
		const to = makePlan({ free_trial: toTrial });

		const diff = diffPlanV1({ from, to });
		expect(diff.free_trial).toEqual(toTrial);

		const result = applyDiff({ base: from, diff });
		expect(result.free_trial).toEqual(toTrial);
	});

	test("identical trials produce no diff and apply preserves the base", () => {
		const trial = {
			duration_length: 14,
			duration_type: FreeTrialDuration.Day,
			card_required: false,
			on_end: "bill" as const,
		};
		const from = makePlan({ free_trial: trial });
		const to = makePlan({ free_trial: trial });

		const diff = diffPlanV1({ from, to });
		expect(diff.free_trial).toBeUndefined();

		const result = applyDiff({ base: from, diff });
		expect(result.free_trial).toEqual(trial);
	});
});
