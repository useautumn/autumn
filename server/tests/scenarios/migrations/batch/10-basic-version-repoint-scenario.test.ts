/**
 * The simplest useful shape: two versions, two customers, one repoint. Start
 * here to confirm the plumbing works before reading any of the complex ones.
 * A rollback op is printed too, so you can send the same customer back to v1.
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq10";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/10-basic-version-repoint-scenario.test.ts";

test(`${chalk.yellowBright("SEED: basic version repoint")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[itemsV2.monthlyMessages({ included: 100 })],
			[itemsV2.monthlyMessages({ included: 200 })],
		],
		members: [
			{
				role: "catalog",
				version: 1,
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "40/100 left before the repoint",
			},
			{ role: "already-v2", version: 2, note: "expect a skipped no-op" },
		],
	});

	await presentScenario({
		title: "basic version repoint",
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
			{
				id: `${ID_PREFIX}-migration-rollback`,
				filter: { customer: { plan: { plan_id: cast.parent.id, version: 2 } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: cast.parent.id, version: 2 },
							version: 1,
						},
					],
				},
				no_billing_changes: true,
			},
		],
		expectation: {
			lane: "batch",
			notes: [
				`${ID_PREFIX}-catalog repoints in place: same customer_product id, new internal_product_id`,
				"messages 40/100 becomes 140/200 — the +100 delta is credited",
				`${ID_PREFIX}-already-v2 is skipped`,
				"the rollback op sends both customers to v1 and should debit 100 back to 40/100",
			],
		},
	});
});
