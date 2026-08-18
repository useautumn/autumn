/**
 * Seeds a plain repoint whose point is the SECOND run: rerun the same migration
 * and nothing should move again, no balance should be credited twice, and the
 * already-on-target customers should read as skipped both times.
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq8";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/08-idempotency-rerun-scenario.test.ts";

test(`${chalk.yellowBright("SEED: idempotency on rerun")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			[
				itemsV2.monthlyMessages({ included: 200 }),
				itemsV2.monthlyCredits({ included: 500 }),
			],
		],
		members: [
			{
				role: "used-a",
				version: 1,
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "40/100 → 140/200 after run 1, and STILL 140/200 after run 2",
			},
			{
				role: "used-b",
				version: 1,
				usage: [{ featureId: TestFeature.Messages, value: 90 }],
				note: "10/100 → 110/200; a second credit would show as 210/200",
			},
			{ role: "fresh-a", version: 1 },
			{ role: "fresh-b", version: 1 },
			{
				role: "rollover",
				version: 1,
				divergence: {
					kind: "rollover",
					featureId: TestFeature.Messages,
					balance: 40,
				},
				note: "rerunning must not duplicate or drop the accrued row",
			},
			{
				role: "already-v2-a",
				version: 2,
				note: "skipped on both runs",
			},
			{
				role: "already-v2-b",
				version: 2,
				note: "skipped on both runs",
			},
		],
	});

	await presentScenario({
		title: "idempotency on rerun",
		cast,
		scenarioFile: SCENARIO_FILE,
		migrations: [
			{
				id: `${ID_PREFIX}-migration`,
				filter: { customer: { plan: { plan_id: cast.parent.id, version: 1 } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: cast.parent.id, version: 1 },
							version: 2,
						},
					],
				},
				no_billing_changes: true,
			},
		],
		expectation: {
			lane: "batch",
			notes: [
				"RUN THIS TWICE — the second run is the whole point",
				"run 1: five v1 holders Succeeded, two already-v2 Skipped",
				"run 2: nothing matches the v1 filter any more, so every item is Skipped",
				"balances are identical after both runs — no double credit anywhere",
				"only one credits row per customer exists at the end, never two",
				"customer_product ids are unchanged between runs, so no orphan rows accumulate",
				"to force a re-process of the skipped items, rerun with retry_item_statuses",
			],
		},
	});
});
