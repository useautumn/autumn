/**
 * Replaying an identical delete must remain a clean no-op after the target row
 * is already gone.
 */
import { expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
} from "../batchTestUtils";

const MESSAGES_INCLUDED = 100;

test(`${chalk.yellowBright("batch migration: replaying a delete is idempotent")}`, async () => {
	const customerId = "batch-delete-idempotency-customer";
	const plan = products.base({
		id: "batch-delete-idempotency-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const runDelete = ({ migrationId }: { migrationId: string }) =>
		runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId,
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, custom: false },
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
						},
					},
				],
			},
			noBillingChanges: true,
		});

	const firstRun = await runDelete({
		migrationId: "batch-delete-idempotency-first",
	});
	expect(firstRun.result?.lane).toBe("batch");
	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: firstRun.migration.internal_id,
		migrationRunId: firstRun.migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Succeeded,
	});

	const replay = await runDelete({
		migrationId: "batch-delete-idempotency-replay",
	});
	expect(replay.result?.lane).toBe("batch");
	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: replay.migration.internal_id,
		migrationRunId: replay.migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Skipped,
	});

	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
		count: 0,
	});
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Dashboard,
		count: 1,
	});
});
