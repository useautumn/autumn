/**
 * Seeds the four ways a customer can look "customized" and prints two ops to
 * compare: the default (custom:false is injected) and the opt-in (custom:true).
 *
 * The trap worth seeing with your own eyes: a custom ENTITLEMENT definition does
 * not set customer_products.is_custom, so that customer is in scope for both ops
 * — it is spared by row matching, not by the filter.
 */
import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { presentScenario } from "./utils/presentScenario";
import { seedMigrationCast } from "./utils/seedMigrationCast";

const ID_PREFIX = "mq9";
const SCENARIO_FILE =
	"tests/scenarios/migrations/batch/09-custom-plan-isolation-scenario.test.ts";

test(`${chalk.yellowBright("SEED: customized-customer isolation")}`, async () => {
	const cast = await seedMigrationCast({
		idPrefix: ID_PREFIX,
		planVersions: [
			[itemsV2.monthlyMessages({ included: 100 })],
			[
				itemsV2.monthlyMessages({ included: 200 }),
				itemsV2.monthlyCredits({ included: 500 }),
			],
		],
		members: [
			{
				role: "catalog",
				version: 1,
				usage: [{ featureId: TestFeature.Messages, value: 60 }],
				note: "the control — must move on op 1",
			},
			{
				role: "custom-attach",
				version: 1,
				divergence: {
					kind: "custom_attach",
					items: [itemsV2.monthlyMessages({ included: 999 })],
				},
				note: "is_custom set at attach time",
			},
			{
				role: "custom-patch",
				version: 1,
				divergence: {
					kind: "custom_patch",
					addItems: [itemsV2.monthlyWords({ included: 25 })],
				},
				note: "is_custom set later by a subscriptions.update patch",
			},
			{
				role: "custom-def",
				version: 1,
				divergence: {
					kind: "custom_definition",
					featureId: TestFeature.Messages,
					allowance: 500,
				},
				note: "is_custom is FALSE — in scope, but its row should not match",
			},
		],
	});

	const planFilter = { plan_id: cast.parent.id, version: 1 };

	await presentScenario({
		title: "customized-customer isolation",
		cast,
		scenarioFile: SCENARIO_FILE,
		migrations: [
			{
				id: `${ID_PREFIX}-migration-default`,
				filter: { customer: { plan: planFilter } },
				operations: {
					customer: [
						{ type: "update_plan", plan_filter: planFilter, version: 2 },
					],
				},
				no_billing_changes: true,
			},
			{
				id: `${ID_PREFIX}-migration-include-custom`,
				filter: { customer: { plan: { ...planFilter, custom: true } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { ...planFilter, custom: true },
							version: 2,
						},
					],
				},
				no_billing_changes: true,
			},
		],
		expectation: {
			lane: "batch",
			notes: [
				"OP 1 (default, custom:false injected):",
				`  ${ID_PREFIX}-catalog moves to v2`,
				`  ${ID_PREFIX}-custom-attach and ${ID_PREFIX}-custom-patch are not even in the page`,
				`  ${ID_PREFIX}-custom-def IS in the page and its product repoints, but its 500-allowance row is left alone`,
				"OP 2 (custom:true) — reset the scenario before running this one:",
				`  the two is_custom holders now repoint too, and their custom rows are preserved`,
				`  ${ID_PREFIX}-custom-attach keeps its 999 messages row while gaining the credits add`,
			],
		},
	});
});
