import { expect, test } from "bun:test";
import {
	buildAllVersionsUpdateMigrationDraft,
	buildCombinedVariantMigrationDraft,
	buildMigrationDraft,
	type ApiPlanV1,
	type DiffedCustomizePlanV1,
	ResetInterval,
} from "@autumn/shared";
import chalk from "chalk";

const plan = ({ included }: { included: number }): ApiPlanV1 =>
	({
		id: "pro",
		name: "Pro",
		description: null,
		group: "",
		version: 1,
		add_on: false,
		auto_enable: false,
		price: null,
		items: [
			{
				feature_id: "messages",
				included,
				unlimited: false,
				reset: { interval: ResetInterval.Month },
				price: null,
			},
		],
		free_trial: undefined,
	}) as ApiPlanV1;

const messagesDiff: DiffedCustomizePlanV1 = {
	remove_items: [
		{
			feature_id: "messages",
			interval: ResetInterval.Month,
			interval_count: 1,
		},
	],
	add_items: [
		{
			feature_id: "messages",
			included: 500,
			unlimited: false,
			reset: { interval: ResetInterval.Month },
		},
	],
};

test(`${chalk.yellowBright("migration draft builder: current-version drafts use diff ops without op version")}`, () => {
	const draft = buildMigrationDraft({
		from: plan({ included: 100 }),
		to: plan({ included: 500 }),
		planId: "pro",
		version: 3,
		scope: "this_version",
	});
	const [operation] = draft.operations.customer ?? [];

	expect(draft.filter).toEqual({
		customer: { plan: { plan_id: "pro", version: 3, custom: false } },
	});
	expect(operation).toEqual({
		type: "update_plan",
		plan_filter: { plan_id: "pro", version: 3 },
		customize: messagesDiff,
	});
	expect(operation).not.toHaveProperty("version");
});

test(`${chalk.yellowBright("migration draft builder: includeCustom true omits operation custom guard")}`, () => {
	const draft = buildMigrationDraft({
		from: plan({ included: 100 }),
		to: plan({ included: 500 }),
		planId: "pro",
		version: 3,
		scope: "this_version",
		includeCustom: true,
	});
	const [operation] = draft.operations.customer ?? [];

	expect(draft.filter).toEqual({
		customer: { plan: { plan_id: "pro", version: 3 } },
	});
	expect(operation).toEqual({
		type: "update_plan",
		plan_filter: { plan_id: "pro", version: 3 },
		customize: messagesDiff,
	});
	expect(operation).not.toHaveProperty("version");
});

test(`${chalk.yellowBright("migration draft builder: propagated current-version variants share one diff op")}`, () => {
	const draft = buildCombinedVariantMigrationDraft({
		targets: [
			{ id: "pro", version: 2, customize: messagesDiff },
			{ id: "pro_annual", version: 2, customize: messagesDiff },
		],
		hasBillingChanges: false,
	});
	const operations = draft?.operations.customer ?? [];

	expect(draft?.filter).toEqual({
		customer: {
			plan: {
				plan_id: { $in: ["pro", "pro_annual"] },
				version: 2,
				custom: false,
			},
		},
	});
	expect(operations).toHaveLength(1);
	expect(operations[0]).toEqual({
		type: "update_plan",
		plan_filter: {
			plan_id: { $in: ["pro", "pro_annual"] },
			version: 2,
		},
		customize: messagesDiff,
	});
	expect(operations[0]).not.toHaveProperty("version");
});

test(`${chalk.yellowBright("migration draft builder: all-version variants share one diff op")}`, () => {
	const draft = buildAllVersionsUpdateMigrationDraft({
		targets: [
			{ id: "pro", customize: messagesDiff },
			{ id: "pro_annual", customize: messagesDiff },
		],
		hasBillingChanges: false,
	});
	const operations = draft?.operations.customer ?? [];

	expect(draft?.filter).toEqual({
		customer: {
			plan: {
				plan_id: { $in: ["pro", "pro_annual"] },
				custom: false,
			},
		},
	});
	expect(operations).toHaveLength(1);
	expect(operations[0]).toEqual({
		type: "update_plan",
		plan_filter: {
			plan_id: { $in: ["pro", "pro_annual"] },
		},
		customize: messagesDiff,
	});
	expect(operations[0]).not.toHaveProperty("version");
});
