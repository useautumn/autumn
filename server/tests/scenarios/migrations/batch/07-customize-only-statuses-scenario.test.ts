/**
 * Seeds one customize-only op against every plan lifecycle status. Statuses are
 * forced straight onto the rows — this is a QA fixture, not a billing story —
 * so the only question being asked is which statuses a batch run is allowed to
 * touch.
 */
import { test } from "bun:test";
import { CusProductStatus, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq7";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/07-customize-only-statuses-scenario.test.ts";

test(`${chalk.yellowBright("SEED: customize-only across every status")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [[itemsV2.monthlyMessages({ included: 100 })]],
		members: [
			{
				role: "active",
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				status: CusProductStatus.Active,
				note: "the ordinary case",
			},
			{
				role: "past-due",
				status: CusProductStatus.PastDue,
				note: "still a live plan — must be migrated",
			},
			{
				role: "paused",
				status: CusProductStatus.Paused,
				note: "still a live plan — must be migrated",
			},
			{
				role: "scheduled",
				status: CusProductStatus.Scheduled,
				note: "future plan — must be migrated so it starts on the new shape",
			},
			{
				role: "expired",
				status: CusProductStatus.Expired,
				note: "dead plan — must NOT be touched",
			},
			{
				role: "trialing",
				status: CusProductStatus.Trialing,
				note: "watch this one: confirm whether it is in scope, and that trial_ends_at survives",
			},
		],
	});

	await presentScenario({
		title: "customize-only across every status",
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
								add_items: [
									itemsV2.monthlyMessages({ included: 200 }),
									itemsV2.dashboard(),
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
				"active, past_due, paused and scheduled all move to messages 200 and gain dashboard",
				`${ID_PREFIX}-expired keeps messages 100 and gains nothing`,
				"no customer_product changes status as a side effect of the run",
				`the version stays put everywhere — this op only customizes`,
				`item_changes should appear under plan_change.item_changes, with no top-level entries`,
			],
		},
	});
});
