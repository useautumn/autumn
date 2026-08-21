/**
 * Seeds customers stranded across three different versions and fans them all
 * into v4 in one migration. Each source version has a different diff to v4, so
 * one run has to compute three distinct transitions and get all of them right.
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq6";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/06-multi-version-fan-in-scenario.test.ts";

test(`${chalk.yellowBright("SEED: multi-version fan-in to the latest")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[itemsV2.monthlyMessages({ included: 100 })],
			[
				itemsV2.monthlyMessages({ included: 200 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			[
				itemsV2.monthlyMessages({ included: 300 }),
				itemsV2.monthlyCredits({ included: 500 }),
			],
			[
				itemsV2.monthlyMessages({ included: 400 }),
				itemsV2.monthlyCredits({ included: 500 }),
				itemsV2.dashboard(),
			],
		],
		members: [
			{
				role: "on-v1",
				version: 1,
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "v1 → v4: messages raised, credits and dashboard added",
			},
			{
				role: "on-v2",
				version: 2,
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "v2 → v4: words removed on top of the same adds",
			},
			{
				role: "on-v3",
				version: 3,
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "v3 → v4: only messages raised and dashboard added",
			},
			{
				role: "already-v4",
				version: 4,
				note: "already on target — expect a skipped no-op",
			},
			{
				role: "customized-v1",
				version: 1,
				divergence: {
					kind: "custom_attach",
					items: [itemsV2.monthlyMessages({ included: 999 })],
				},
				note: "is_custom on v1 — stays on v1",
			},
		],
	});

	await presentScenario({
		title: "multi-version fan-in to the latest",
		cast,
		scenarioFile: SCENARIO_FILE,
		migrations: [
			{
				id: `${ID_PREFIX}-migration`,
				filter: {
					customer: {
						plan: { plan_id: cast.parent.id, version: { $in: [1, 2, 3] } },
					},
				},
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: {
								plan_id: cast.parent.id,
								version: { $in: [1, 2, 3] },
							},
							version: 4,
						},
					],
				},
				no_billing_changes: true,
			},
		],
		expectation: {
			lane: "batch",
			notes: [
				"all three stranded customers end on v4, each keeping its customer_product id",
				`messages balances carry per source: 40/100 → 340/400, 140/200 → 340/400, 240/300 → 340/400`,
				`${ID_PREFIX}-on-v2 loses its words row; the others never had one`,
				`every migrated customer ends with messages, ${TestFeature.Credits} and ${TestFeature.Dashboard}`,
				`${ID_PREFIX}-already-v4 is skipped and ${ID_PREFIX}-customized-v1 stays on v1`,
			],
		},
	});
});
