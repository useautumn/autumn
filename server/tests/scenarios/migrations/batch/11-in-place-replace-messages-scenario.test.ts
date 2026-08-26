/**
 * Dashboard in-place catalog rewrite: messages 100/mo → 200, then the
 * auto-drafted migration. Seed stays on the old catalog; the customize op is
 * the same replace the dashboard draft would run.
 */
import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq11";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/11-in-place-replace-messages-scenario.test.ts";

test(`${chalk.yellowBright("SEED: in-place 100→200 mixed replace")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[itemsV2.dashboard(), itemsV2.monthlyMessages({ included: 100 })],
		],
		members: [
			{
				role: "catalog",
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "40/100 left — remaining should become 140 after the +100 credit",
			},
			{
				role: "unused",
				note: "100/100 left — remaining should become 200",
			},
		],
	});

	await presentScenario({
		title: "in-place 100→200 mixed replace",
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
								add_items: [itemsV2.monthlyMessages({ included: 200 })],
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
				"run this drafted customize op, OR skip it: in the dashboard, in-place edit the plan (disable_version / all_versions) messages 100→200, then run the auto-drafted migration",
				`${ID_PREFIX}-catalog: messages 40/100 becomes 140/200 — remaining += 100, one messages row, no leftover 100+200`,
				`${ID_PREFIX}-unused: messages 100/100 becomes 200/200`,
				`${TestFeature.Dashboard} is untouched on both customers`,
				`seed/reset from server/: ./run.sh $(pwd)/${SCENARIO_FILE}`,
			],
		},
	});
});
