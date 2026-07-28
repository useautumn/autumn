/** Regression: preparation and Trigger serialization must hash omitted plan-item defaults identically.
 * Red missed the artifact after `pooled: false` appeared; green applies the boolean entitlement. */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrateCustomer } from "@/internal/migrations/v2/run/migrateCustomer/index.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { PreparedMigrationSnapshotSchema } from "@/trigger/migrations/migrationTaskPayload.js";

test.concurrent(
	`${chalk.yellowBright("migrations prepare runtime: schema defaults preserve prepared artifact identity")}`,
	async () => {
		const customerId = "prep-artifact-schema-defaults";
		const plan = products.pro({
			id: "prep-artifact-schema-defaults-plan",
			items: [],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const rawOperations = {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					customize: {
						add_items: [
							{
								feature_id: TestFeature.Dashboard,
								included: 0,
								unlimited: false,
							},
						],
					},
				},
			],
		} satisfies Operations;

		const storedMigration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `${customerId}-mig`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: rawOperations,
			no_billing_changes: true,
		});
		const preparedMigration = await prepareMigration({
			ctx,
			migration: { ...storedMigration, operations: rawOperations },
			dryRun: false,
		});
		const migrationSnapshot =
			PreparedMigrationSnapshotSchema.parse(preparedMigration);
		const operation = migrationSnapshot.operations?.customer?.[0];
		if (operation?.type !== "update_plan") {
			throw new Error("Expected an update_plan operation");
		}

		expect(operation.customize?.add_items?.[0]?.pooled).toBe(false);

		const result = await migrateCustomer({
			ctx,
			customerId,
			migration: migrationSnapshot,
		});
		expect(result.status).toBe("succeeded");

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			planId: plan.id,
		});
	},
);
