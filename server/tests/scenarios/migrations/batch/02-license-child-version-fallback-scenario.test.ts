/**
 * Seeds the license fallback shape: the parent's v2 link points at a NEWER seat
 * plan version than v1's link does, so the repoint changes the child product.
 * That is refused by the batch lane and lands on the per-customer lane instead —
 * which should still produce the full, correct transition.
 *
 * The seeder mints the seat version before minting parent v2, which is what
 * makes v1 and v2 disagree about which seat version they link.
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq2";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/02-license-child-version-fallback-scenario.test.ts";

test(`${chalk.yellowBright("SEED: license child version change falls back to per-customer")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[itemsV2.monthlyMessages({ included: 100 })],
			[itemsV2.monthlyMessages({ included: 200 })],
		],
		licensePlan: {
			versions: [
				[itemsV2.monthlyWords({ included: 500 })],
				[itemsV2.monthlyWords({ included: 750 })],
			],
			includedSeats: 2,
		},
		members: [
			{
				role: "catalog",
				version: 1,
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				seats: { attached: 2, assigned: 2 },
				note: "two live seats on the OLD seat version — the ones that must follow",
			},
			{
				role: "unassigned",
				version: 1,
				note: "pool on the old seat version, no live seats to carry",
			},
			{
				role: "customized",
				version: 1,
				divergence: {
					kind: "custom_attach",
					items: [itemsV2.monthlyMessages({ included: 999 })],
				},
				note: "is_custom, so it should be skipped in either lane",
			},
		],
	});

	await presentScenario({
		title: "license child version change → per-customer fallback",
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
			lane: "per_customer",
			rejections: ["license_link_transition"],
			notes: [
				"the run must NOT take the batch lane — a changed child product is refused",
				"the per-customer lane should still land everything below",
				`${ID_PREFIX}-catalog's parent row moves to v2, keeping its customer_product id`,
				"the pool repoints to the v2 link and to the new seat internal_product_id",
				`each live seat assignment moves to the new seat version: ${TestFeature.Words} 500 → 750`,
				"pool link_id is stable throughout, so seats never detach",
				`${ID_PREFIX}-customized keeps every row exactly as seeded`,
			],
		},
	});
});
