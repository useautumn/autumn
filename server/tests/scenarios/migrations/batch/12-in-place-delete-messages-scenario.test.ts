/**
 * Dashboard in-place: drop messages/mo from the live catalog, then migrate.
 * Dashboard stays on the plan so you can see something survived after the row
 * is gone.
 */
import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq12";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/12-in-place-delete-messages-scenario.test.ts";

test(`${chalk.yellowBright("SEED: in-place delete messages")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[itemsV2.dashboard(), itemsV2.monthlyMessages({ included: 100 })],
		],
		members: [
			{
				role: "catalog",
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "40/100 left — the messages row should disappear entirely",
			},
			{
				role: "unused",
				note: "full 100 — also gone after migrate; dashboard stays",
			},
		],
	});

	await presentScenario({
		title: "in-place delete messages",
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
								remove_items: [
									{
										feature_id: TestFeature.Messages,
										interval: ResetInterval.Month,
									},
								],
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
				"run this drafted customize op, OR skip it: in the dashboard, in-place remove messages/mo (disable_version / all_versions), then run the auto-drafted migration",
				`${ID_PREFIX}-catalog and ${ID_PREFIX}-unused: messages row is gone — no leftover 100/mo`,
				`${TestFeature.Dashboard} stays on both customers so the plan still has something`,
				`seed/reset from server/: ./run.sh $(pwd)/${SCENARIO_FILE}`,
			],
		},
	});
});
