import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq5";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/05-delete-item-spare-rules-scenario.test.ts";

test(`${chalk.yellowBright("SEED: delete one item, every spare rule at once")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
		],
		licensePlan: {
			versions: [[itemsV2.monthlyMessages({ included: 500 })]],
			includedSeats: 2,
		},
		members: [
			{
				role: "catalog",
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				seats: { attached: 2, assigned: 2 },
				note: "parent messages row goes; both seat messages rows stay",
			},
			{
				role: "custom-same",
				divergence: {
					kind: "custom_definition",
					featureId: TestFeature.Messages,
				},
				note: "identical meaning — matches the catalog definition, so it goes",
			},
			{
				role: "custom-diff",
				divergence: {
					kind: "custom_definition",
					featureId: TestFeature.Messages,
					allowance: 500,
				},
				note: "different allowance — must survive",
			},
			{
				role: "paid",
				divergence: { kind: "paid_row", featureId: TestFeature.Messages },
				note: "paid row — must survive, along with its customer_price",
			},
			{
				role: "rollover",
				divergence: {
					kind: "rollover",
					featureId: TestFeature.Messages,
					balance: 40,
					usage: 4,
				},
				note: "accrued rollover — dropping this row would destroy balance",
			},
		],
	});

	await presentScenario({
		title: "delete one item, every spare rule at once",
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
				`${ID_PREFIX}-catalog and ${ID_PREFIX}-custom-same lose their parent messages row`,
				`${ID_PREFIX}-custom-diff, ${ID_PREFIX}-paid and ${ID_PREFIX}-rollover keep theirs`,
				`${ID_PREFIX}-catalog's two seat rows keep ${TestFeature.Messages} 500 — license isolation`,
				`${TestFeature.Words} is untouched everywhere — only the filtered feature is removed`,
				"no rollover row is deleted anywhere",
			],
		},
	});
});
