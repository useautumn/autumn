import { expect, test } from "bun:test";
import { customerEntitlements, MigrationItemRunStatus } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { expectMigrationItemRunStatus } from "../batchTestUtils";
import { readScopedFeatureRow } from "../paidRowTestUtils";

const ORIGINAL_ALLOWANCE = 100;
const REPLACEMENT_ALLOWANCE = 200;
const CONSUMED = 60;

test(`${chalk.yellowBright("batch replace_item: replay credits the allowance delta once")}`, async () => {
	const customerId = "batch-replace-item-idempotency-customer";
	const plan = products.base({
		id: "batch-replace-item-idempotency-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: ORIGINAL_ALLOWANCE }),
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const originalRow = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	await ctx.db
		.update(customerEntitlements)
		.set({ balance: ORIGINAL_ALLOWANCE - CONSUMED })
		.where(eq(customerEntitlements.id, originalRow.id));
	const consumedRow = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(consumedRow.balance).toBe(ORIGINAL_ALLOWANCE - CONSUMED);

	const runReplace = ({ migrationId }: { migrationId: string }) =>
		runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId,
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan" as const,
						plan_filter: { plan_id: plan.id, custom: false },
						customize: {
							add_items: [
								itemsV2.monthlyMessages({
									included: REPLACEMENT_ALLOWANCE,
								}),
							],
							remove_items: [{ feature_id: TestFeature.Messages }],
						},
					},
				],
			},
			noBillingChanges: true,
		});

	const firstRun = await runReplace({
		migrationId: "batch-replace-item-idempotency-first",
	});
	expect(firstRun.result?.lane).toBe("batch");

	const afterFirstRun = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(afterFirstRun.id).toBe(originalRow.id);
	expect(afterFirstRun.entitlement_id).not.toBe(originalRow.entitlement_id);
	expect(afterFirstRun.balance).toBe(REPLACEMENT_ALLOWANCE - CONSUMED);

	const replayRun = await runReplace({
		migrationId: "batch-replace-item-idempotency-replay",
	});
	expect(replayRun.result?.lane).toBe("batch");

	const afterReplay = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(afterReplay).toEqual(afterFirstRun);
	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: replayRun.migration.internal_id,
		migrationRunId: replayRun.migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Skipped,
	});
});
