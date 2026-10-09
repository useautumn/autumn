/**
 * Every batch op commits its customer changes together with the item run that
 * records them, and only while this run still holds the customer's claim.
 */

import { afterAll, expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { getInternalCustomerId } from "../batchTestUtils.js";
import { installPageFaults } from "./utils/installPageFaults.js";
import {
	runRecoveryMigration,
	updatePlanAddingItems,
} from "./utils/runRecoveryMigration.js";

const { pageFaults, restore } = await installPageFaults();
afterAll(restore);

const setupAddWorkflowsMigration = async ({
	customerId,
	planId,
}: {
	customerId: string;
	planId: string;
}) => {
	const plan = products.base({ id: planId, items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `${planId}-${Date.now().toString(36)}`,
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				updatePlanAddingItems({
					planId: plan.id,
					addItems: [{ feature_id: TestFeature.Workflows, included: 10 }],
				}),
			],
		},
		no_billing_changes: true,
	});
	const getItemRun = async () => {
		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		const [itemRun] = await ctx.db
			.select()
			.from(migrationItemRuns)
			.where(
				and(
					eq(migrationItemRuns.migration_internal_id, migration.internal_id),
					eq(migrationItemRuns.item_id, internalCustomerId),
				),
			);
		return itemRun;
	};
	return { autumnV2_2, ctx, plan, migration, getItemRun };
};

test.concurrent(
	`${chalk.yellowBright("batch recorded changes: a page that dies after its add commits keeps the change on the failed item run")}`,
	async () => {
		const customerId = "batch-recorded-changes";
		const { ctx, plan, migration, getItemRun } =
			await setupAddWorkflowsMigration({
				customerId,
				planId: "batch-recorded-changes",
			});

		pageFaults.set(plan.id, "after_add");
		const failedRun = await runRecoveryMigration({ ctx, migration });
		pageFaults.delete(plan.id);

		expect(String(failedRun.error)).toContain("injected");
		const itemRun = await getItemRun();
		expect(itemRun.status).toBe(MigrationItemRunStatus.Failed);
		expect(itemRun.unpublished_changes).toMatchObject([
			{
				kind: "entitlement_created",
				planId: plan.id,
				featureId: TestFeature.Workflows,
				granted: 10,
				unlimited: false,
				status: "active",
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch recorded changes: an op whose claim was released rolls back its writes")}`,
	async () => {
		const customerId = "batch-released-claim";
		const { autumnV2_2, ctx, plan, migration, getItemRun } =
			await setupAddWorkflowsMigration({
				customerId,
				planId: "batch-released-claim",
			});

		pageFaults.set(plan.id, "release_claims_before_add");
		const failedRun = await runRecoveryMigration({ ctx, migration });
		pageFaults.delete(plan.id);

		expect(String(failedRun.error)).toContain("claim");
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Workflows]).toBeUndefined();
		const itemRun = await getItemRun();
		expect(itemRun.status).toBe(MigrationItemRunStatus.Failed);
		expect(itemRun.unpublished_changes).toBeNull();
	},
);
