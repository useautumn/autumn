/**
 * Seeds three cadence changes in one op, one per anchor path: monthly →
 * every-3-months, lifetime → monthly, monthly → lifetime.
 *
 * Note these do NOT lower as in-place replaces: the match key includes the
 * interval, so a cadence change pairs as a delete plus an add. The thing worth
 * checking is that the balance still carries and the new row gets a sane
 * next_reset_at rather than inheriting the old cycle.
 */
import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq4";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/04-cadence-transition-anchors-scenario.test.ts";

/** No reset block at all is what makes an item lifetime. */
const lifetimeItem = ({
	featureId,
	included,
}: {
	featureId: string;
	included: number;
}) => ({ feature_id: featureId, included });

const everyNMonths = ({
	featureId,
	included,
	intervalCount,
}: {
	featureId: string;
	included: number;
	intervalCount: number;
}) => ({
	feature_id: featureId,
	included,
	reset: { interval: ResetInterval.Month, interval_count: intervalCount },
});

test(`${chalk.yellowBright("SEED: cadence transitions across all anchor paths")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[
				itemsV2.monthlyMessages({ included: 100 }),
				lifetimeItem({ featureId: TestFeature.Words, included: 50 }),
				itemsV2.monthlyCredits({ included: 300 }),
			],
		],
		members: [
			{
				role: "catalog",
				usage: [
					{ featureId: TestFeature.Messages, value: 60 },
					{ featureId: TestFeature.Words, value: 20 },
					{ featureId: TestFeature.Credits, value: 100 },
				],
				note: "usage on all three so every carry is visible",
			},
			{
				role: "custom-diff",
				divergence: {
					kind: "custom_definition",
					featureId: TestFeature.Messages,
					allowance: 500,
				},
				note: "different messages definition — its cadence must not change",
			},
		],
	});

	await presentScenario({
		title: "cadence transitions across all anchor paths",
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
									{ feature_id: TestFeature.Words },
									{
										feature_id: TestFeature.Credits,
										interval: ResetInterval.Month,
									},
								],
								add_items: [
									everyNMonths({
										featureId: TestFeature.Messages,
										included: 200,
										intervalCount: 3,
									}),
									itemsV2.monthlyWords({ included: 100 }),
									lifetimeItem({
										featureId: TestFeature.Credits,
										included: 600,
									}),
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
				`messages: monthly → every 3 months, 40/100 carries to 140/200`,
				`words: lifetime → monthly, 30/50 carries to 80/100 and gains a next_reset_at`,
				`credits: monthly → lifetime, 200/300 carries to 500/600 and next_reset_at goes null`,
				"each new row's reset_cycle_anchor should reflect the new cadence, not the old one",
				`${ID_PREFIX}-custom-diff keeps its 500 monthly messages row untouched`,
			],
		},
	});
});
