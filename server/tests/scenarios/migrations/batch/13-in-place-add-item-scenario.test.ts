/**
 * Dashboard in-place: add words onto a 100/mo + dashboard catalog, then
 * migrate. Messages must stay; words must appear once, not as a duplicate add.
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq13";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/13-in-place-add-item-scenario.test.ts";

test(`${chalk.yellowBright("SEED: in-place add an item")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[itemsV2.dashboard(), itemsV2.monthlyMessages({ included: 100 })],
		],
		members: [
			{
				role: "catalog",
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "40/100 left — messages stay; words should appear once at 50",
			},
			{
				role: "unused",
				note: "full 100 messages — still there after words is added",
			},
		],
	});

	await presentScenario({
		title: "in-place add an item",
		cast,
		scenarioFile: SCENARIO_FILE,
		migrations: [
			{
				id: `${ID_PREFIX}-migration`,
				filter: { customer: { plan: { plan_id: cast.parent.id } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: cast.parent.id },
							customize: {
								add_items: [itemsV2.monthlyWords({ included: 50 })],
							},
						},
					],
				},
				no_billing_changes: true,
			},
		],
		expectation: {
			lane: "batch",
			notes: [
				"run this drafted customize op, OR skip it: in the dashboard, in-place add words (disable_version / all_versions), then run the auto-drafted migration",
				`${ID_PREFIX}-catalog: messages stays 40/100 — not reset, not duplicated`,
				`${ID_PREFIX}-unused: messages stays 100/100`,
				`both customers gain one ${TestFeature.Words} 50/mo row — no duplicate add`,
				`${TestFeature.Dashboard} is untouched`,
				`seed/reset from server/: ./run.sh $(pwd)/${SCENARIO_FILE}`,
			],
		},
	});
});
