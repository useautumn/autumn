/**
 * Seeds the most complex batch-migration shape and leaves it in the DB: a
 * two-version parent plan linked to a seat license plan, held by five customers
 * in five different states. Runs no migration and asserts nothing — drive the
 * printed op yourself, then re-read with SEED=0.
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq1";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/01-version-repoint-customize-licenses-scenario.test.ts";

test(`${chalk.yellowBright("SEED: version repoint + customize + licenses")}`, async () => {
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
		licensePlan: {
			versions: [[itemsV2.monthlyMessages({ included: 500 })]],
			includedSeats: 2,
		},
		members: [
			{
				role: "catalog",
				version: 1,
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				seats: { attached: 2, assigned: 2 },
				note: "the one that must move: 40/100 left, two live seats",
			},
			{
				role: "customized",
				version: 1,
				divergence: {
					kind: "custom_attach",
					items: [itemsV2.monthlyMessages({ included: 999 })],
				},
				note: "is_custom — the auto-injected custom:false must skip it",
			},
			{
				role: "custom-def",
				version: 1,
				divergence: {
					kind: "custom_definition",
					featureId: TestFeature.Messages,
					allowance: 500,
				},
				note: "definition differs from v1, so the replace must not match it",
			},
			{
				role: "already-v2",
				version: 2,
				note: "already on the target — expect a skipped no-op",
			},
			{
				role: "unassigned",
				version: 1,
				note: "pool but no live seats, so the license customize touches no rows",
			},
		],
	});

	await presentScenario({
		title: "version repoint + customize + licenses",
		cast,
		scenarioFile: SCENARIO_FILE,
		migrations: [
			{
				id: `${ID_PREFIX}-migration`,
				filter: {
					customer: { plan: { plan_id: cast.parent.id, version: 1 } },
				},
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: cast.parent.id, version: 1 },
							version: 2,
							customize: {
								upsert_licenses: [
									{
										license_plan_id: cast.seat?.id ?? "",
										customize: { add_items: [itemsV2.dashboard()] },
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
				`${ID_PREFIX}-catalog repoints to v2 in place: same customer_product id, new internal_product_id`,
				`messages carries its usage — 40/100 becomes 140/200, not a reset to 200`,
				`words rows are dropped, a ${TestFeature.Credits} row appears`,
				`the pool's plan_license_id repoints to a minted is_custom row; link_id is unchanged`,
				`each live seat gains one ${TestFeature.Dashboard} row (neither plan carried it at seed time)`,
				`${ID_PREFIX}-customized and ${ID_PREFIX}-custom-def keep every row exactly as seeded`,
				`${ID_PREFIX}-already-v2 is skipped; ${ID_PREFIX}-unassigned gains no seat rows`,
			],
		},
	});
});
