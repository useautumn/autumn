/**
 * Seeds one customize op that replaces, deletes and adds at the same time,
 * against a cast holding every row shape the batch lane has to tell apart.
 *
 * The messages remove+add share a match key, so they lower as a replace that
 * carries the balance. The words remove has no matching add, so it is a plain
 * deletion. Credits is a pure add.
 */
import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq3";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/03-mixed-replace-delete-add-scenario.test.ts";

test(`${chalk.yellowBright("SEED: replace + delete + add in one op")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
				itemsV2.dashboard(),
			],
		],
		members: [
			{
				role: "catalog",
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "40/100 left — the balance that must survive the replace",
			},
			{
				role: "custom-same",
				divergence: {
					kind: "custom_definition",
					featureId: TestFeature.Messages,
				},
				note: "custom row, identical meaning — entsAreSame, so it IS replaced",
			},
			{
				role: "custom-diff",
				divergence: {
					kind: "custom_definition",
					featureId: TestFeature.Messages,
					allowance: 500,
				},
				note: "custom row, different allowance — must NOT be replaced",
			},
			{
				role: "paid",
				divergence: { kind: "paid_row", featureId: TestFeature.Messages },
				note: "a paid price hangs off this row — never remove a paid feature",
			},
			{
				role: "rollover",
				divergence: {
					kind: "rollover",
					featureId: TestFeature.Messages,
					balance: 40,
				},
				note: "accrued rollover the catalog never declared — spare the row",
			},
		],
	});

	await presentScenario({
		title: "replace + delete + add in one op",
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
									{
										feature_id: TestFeature.Words,
										interval: ResetInterval.Month,
									},
								],
								add_items: [
									itemsV2.monthlyMessages({ included: 200 }),
									itemsV2.monthlyCredits({ included: 500 }),
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
				`${ID_PREFIX}-catalog: messages 40/100 becomes 140/200 — the delta is credited, not reset`,
				`${ID_PREFIX}-catalog: the words row disappears and a ${TestFeature.Credits} 500 row appears`,
				`${ID_PREFIX}-custom-same is replaced too, and lands on the SAME shared prepared entitlement as catalog`,
				`${ID_PREFIX}-custom-diff keeps its 500 allowance row untouched`,
				`${ID_PREFIX}-paid keeps both its row and its customer_price`,
				`${ID_PREFIX}-rollover keeps its row and its 40 accrued balance`,
				`every member still gains the ${TestFeature.Credits} row — the add is unconditional`,
				`${TestFeature.Dashboard} is untouched everywhere`,
			],
		},
	});
});
