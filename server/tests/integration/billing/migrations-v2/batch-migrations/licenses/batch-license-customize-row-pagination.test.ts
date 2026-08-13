/**
 * Candidate-row pagination for license assignments. Pages are sized in
 * customers, but assignments are read + inserted in id-keyset batches.
 *
 * Driven with candidateRowBatchSize: 1 so every batch boundary — and its
 * per-batch transaction — is crossed.
 *
 * Contract under test:
 *   - Every assignment is visited exactly once across batches: none skipped
 *     by the cursor, none duplicated by re-reading a mutated row.
 *   - The pool repoint (whole-page, before pagination) is applied once.
 *   - Replaying over the paginated path inserts nothing.
 */

import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { inArray } from "drizzle-orm";
import { addLicenseEntitlementsForPage } from "@/internal/migrations/v2/batchOperations/actions/addLicenseEntitlementsForPage/addLicenseEntitlementsForPage.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";
import { getInternalCustomerId } from "../batchTestUtils";

const CATALOG_SEAT_PRICE = 20;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 4;
const ASSIGNED_SEATS = 3;

test.concurrent(
	`${chalk.yellowBright("batch license pagination: single-row batches visit every assignment exactly once")}`,
	async () => {
		const suffix = Date.now().toString(36);
		const customerId = `lic-pagination-${suffix}`;
		const idPrefix = `lic-pag-${suffix}`;

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: CATALOG_SEAT_PRICE,
			seatItems: [items.monthlyMessages({ includedUsage: 500 })],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const { ctx, autumnV2_2, parent, devSeat } = scenario;
		const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
		const liveAssignments = assignments.filter(
			(assignment) => assignment.internal_entity_id,
		);
		expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `lic-pagination-mig-${suffix}`,
			filter: { customer: { plan: { plan_id: parent.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: parent.id, custom: false },
						customize: {
							upsert_licenses: [
								{
									license_plan_id: devSeat.id,
									customize: { add_items: [itemsV2.dashboard()] },
								},
							],
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
		const [operation] = patch.licenseEntitlementOps;
		const internalCustomerIds = [
			await getInternalCustomerId({ ctx, customerId }),
		];

		// One assignment per batch: every boundary crossed.
		const result = await addLicenseEntitlementsForPage({
			db: ctx.db,
			features: ctx.features,
			scope: patch.scope,
			internalCustomerIds,
			operation,
			now: Date.now(),
			candidateRowBatchSize: 1,
		});

		expect(result.affected).toBe(ASSIGNED_SEATS);
		expect(result.candidateCount).toBe(ASSIGNED_SEATS);
		expect(result.repointedPools).toBe(1);
		expect(result.excludedInternalCustomerIds).toEqual([]);
		expect([
			...new Set(result.insertedItems.map((item) => item.customerProductId)),
		]).toHaveLength(ASSIGNED_SEATS);

		// Exactly one row per assignment — the cursor neither skipped nor doubled.
		const countDashboardRows = async () => {
			const rows = await ctx.db
				.select({ featureId: customerEntitlements.feature_id })
				.from(customerEntitlements)
				.where(
					inArray(
						customerEntitlements.customer_product_id,
						liveAssignments.map((assignment) => assignment.id),
					),
				);
			return rows.filter((row) => row.featureId === TestFeature.Dashboard)
				.length;
		};
		expect(await countDashboardRows()).toBe(ASSIGNED_SEATS);

		// Replay over the paginated path: per-batch dedup still holds.
		const replay = await addLicenseEntitlementsForPage({
			db: ctx.db,
			features: ctx.features,
			scope: patch.scope,
			internalCustomerIds,
			operation,
			now: Date.now(),
			candidateRowBatchSize: 1,
		});
		expect(replay.affected).toBe(0);
		expect(replay.candidateCount).toBe(0);
		expect(replay.repointedPools).toBe(0);
		expect(await countDashboardRows()).toBe(ASSIGNED_SEATS);
	},
);
