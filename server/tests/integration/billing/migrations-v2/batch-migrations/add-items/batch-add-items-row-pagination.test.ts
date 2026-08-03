/**
 * Candidate-row pagination: pages are sized in customers, but candidates are
 * read + inserted in cp.id-keyset batches (BATCH_MIGRATION_CANDIDATE_ROW_BATCH).
 *
 * Contract under test (driven with candidateRowBatchSize: 1 so every batch
 * boundary — and its per-batch transaction — is exercised):
 *   - The advisory pre-count matches the rows the batches then visit.
 *   - Every candidate row is visited exactly once across batches — each
 *     customer ends with exactly one added cusEnt row, none skipped, none
 *     duplicated by the pagination itself.
 *   - Replaying the same add over the paginated path inserts nothing (the
 *     per-batch dedup still holds).
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addCustomerEntitlementsForPage } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";
import {
	expectCustomerEntitlementRowCount,
	getInternalCustomerId,
} from "../batchTestUtils";

test.concurrent(
	`${chalk.yellowBright("batch row pagination: single-row batches visit every candidate exactly once")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const customerIds = [1, 2, 3].map((n) => `row-pagination-${n}-${suffix}`);
		const [firstId, ...otherIds] = customerIds;
		const plan = products.base({
			id: `row-pagination-plan-${suffix}`,
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: firstId,
			setup: [
				s.customer(),
				s.otherCustomers(otherIds.map((id) => ({ id }))),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				...otherIds.map((customerId) =>
					s.billing.attach({ customerId, productId: plan.id }),
				),
			],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `row-pagination-mig-${suffix}`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: {
							add_items: [itemsV2.monthlyMessages({ included: 100 })],
						},
					},
				],
			},
			no_billing_changes: true,
		});

		const preparedMigration = await prepareMigration({
			ctx,
			migration,
			dryRun: false,
		});
		const batchLane = await shouldRunBatchLane({
			ctx,
			migration: preparedMigration,
			migrationRunId: generateId("mrun"),
			dryRun: false,
			controls: undefined,
			hasCustomHooks: false,
			hasCloudBatchAdapter: false,
		});
		if (!batchLane.shouldRun)
			throw new Error("expected the migration to be batch-eligible");
		const [patch] = batchMigrationPlanToExecutionPlan({
			plan: batchLane.plan,
		}).patches;
		const [add] = patch.addEntitlementOps;

		const internalCustomerIds = await Promise.all(
			customerIds.map((customerId) =>
				getInternalCustomerId({ ctx, customerId }),
			),
		);

		// One row per batch: three customers → at least three select→insert
		// loops, every batch boundary crossed.
		const result = await addCustomerEntitlementsForPage({
			db: ctx.db,
			scope: patch.scope,
			internalCustomerIds,
			fromProduct: patch.fromProduct,
			add,
			now: Date.now(),
			candidateRowBatchSize: 1,
		});

		expect(result.affected).toBe(3);
		expect(result.candidateCount).toBe(3);
		expect(result.excludedInternalCustomerIds).toEqual([]);
		expect([
			...new Set(result.insertedItems.map((item) => item.customerProductId)),
		]).toHaveLength(3);
		for (const customerId of customerIds) {
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId: plan.id,
				featureId: TestFeature.Messages,
				count: 1,
			});
		}

		// Replay over the paginated path: dedup holds per batch — no inserts.
		const replay = await addCustomerEntitlementsForPage({
			db: ctx.db,
			scope: patch.scope,
			internalCustomerIds,
			fromProduct: patch.fromProduct,
			add,
			now: Date.now(),
			candidateRowBatchSize: 1,
		});
		expect(replay.affected).toBe(0);
		expect(replay.candidateCount).toBe(0);
		for (const customerId of customerIds) {
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId: plan.id,
				featureId: TestFeature.Messages,
				count: 1,
			});
		}
	},
);
