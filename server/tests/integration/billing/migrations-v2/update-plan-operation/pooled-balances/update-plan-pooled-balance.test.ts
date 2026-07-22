/** Migration update_plan inherits pooled transitions from updateSubscription. */

/** Contract: unrelated item updates preserve the pool and its contribution identity. */

/** Contract: 100 -> 200 pooled messages adds only the grant delta while retaining usage. */

/** Contract: non-pooled -> pooled messages creates one contribution with carried usage. */

import { test } from "bun:test";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration.js";
import {
	buildPooledMigrationCustomization,
	expectPooledCustomizationResult,
	type PooledCustomizationCase,
	setupPooledCustomizationScenario,
} from "@tests/integration/billing/pooled-balances/utils/pooledBalanceCustomizationTestUtils.js";
import chalk from "chalk";

const migrationCases: Array<{
	id: PooledCustomizationCase;
	label: string;
}> = [
	{ id: "unrelated_item", label: "unrelated item preserves the pool" },
	{ id: "increase_grant", label: "pooled grant increase applies the delta" },
	{ id: "enable_pooling", label: "private to pooled carries usage" },
];

for (const migrationCase of migrationCases) {
	test.concurrent(
		`${chalk.yellowBright(`pooled migration update_plan: ${migrationCase.label}`)}`,
		async () => {
			const customerId = `pooled-migration-${migrationCase.id}`;
			const scenario = await setupPooledCustomizationScenario({
				customerId,
				case: migrationCase.id,
			});

			await runUpdatePlanMigration({
				ctx: scenario.ctx,
				migrationClient: scenario.autumnV2_2,
				migrationId: `${customerId}-migration`,
				customerId,
				filter: { customer: { plan: { plan_id: scenario.plan.id } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: scenario.plan.id },
							customize: buildPooledMigrationCustomization({
								case: migrationCase.id,
							}),
						},
					],
				},
				runOnServer: false,
			});

			await expectPooledCustomizationResult({
				scenario,
				case: migrationCase.id,
				surface: "migration",
			});
		},
	);
}
