import { expect, test } from "bun:test";
import { MigrationRunStatus } from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	migrationItemRunRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { waitForMigrationResult } from "../../utils/runUpdatePlanMigration.js";

const CUSTOMER_COUNT = 10;

test.concurrent(
	`${chalk.yellowBright("migration cancel (batch): in-flight item finishes, remaining items skipped, run canceled")}`,
	async () => {
		/**
		 * Contract under test:
		 *   New behaviors:
		 *     - Cancelling a running batch migration lets the in-flight item
		 *       finish (>=1 succeeded) but skips the rest (no claim, no row, none
		 *       cut off mid-migration), so total processed < CUSTOMER_COUNT.
		 *     - The run settles to `canceled` (not `succeeded`).
		 *   Side effects:
		 *     - No migration_item_runs row ends up `failed`.
		 */
		const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const customerIds = Array.from(
			{ length: CUSTOMER_COUNT },
			(_, i) => `cancel-batch-${i}-${suffix}`,
		);
		const plan = products.base({
			id: `cancel-batch-plan-${suffix}`,
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: customerIds[0],
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers(customerIds.slice(1).map((id) => ({ id }))),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					...customerIds.map((id) =>
						id === customerIds[0]
							? s.billing.attach({ productId: plan.id })
							: s.billing.attach({ customerId: id, productId: plan.id }),
					),
				),
			],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `cancel-batch-mig-${suffix}`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
			no_billing_changes: true,
		});

		const runResponse = await autumnV2_2.migrationsV2.run({
			id: migration.id,
			dry_run: false,
			concurrency: 1,
		});

		// Wait until the batch has started (>=1 claimed item), then cancel ASAP so
		// the remaining items hit the gate before they are claimed.
		await waitForMigrationResult({
			timeoutMs: 30_000,
			pollIntervalMs: 150,
			waitFor: async () => {
				const counts = await migrationItemRunRepo.getCounts({
					ctx,
					migrationInternalId: migration.internal_id,
					dryRun: false,
					migrationRunId: runResponse.run_id,
				});
				expect(counts.total).toBeGreaterThanOrEqual(1);
			},
		});

		const cancel = await autumnV2_2.migrationsV2.cancelRun({ id: migration.id });
		expect(cancel.canceled).toBe(true);

		await waitForMigrationResult({
			timeoutMs: 60_000,
			pollIntervalMs: 500,
			waitFor: async () => {
				const [run] = await migrationRunRepo.list({
					ctx,
					internalId: runResponse.run_id,
				});
				if (!run) throw new Error("Run not found");
				if (run.status !== MigrationRunStatus.Canceled)
					throw new Error(`Run still ${run.status}`);
			},
		});

		const [run] = await migrationRunRepo.list({
			ctx,
			internalId: runResponse.run_id,
		});
		expect(run.status).toBe(MigrationRunStatus.Canceled);
		expect(run.error_message).toBe("Canceled by user");

		const counts = await migrationItemRunRepo.getCounts({
			ctx,
			migrationInternalId: migration.internal_id,
			dryRun: false,
			migrationRunId: runResponse.run_id,
		});

		// In-flight item(s) finished, the rest were skipped before claiming.
		expect(counts.succeeded).toBeGreaterThanOrEqual(1);
		expect(counts.total).toBeLessThan(CUSTOMER_COUNT);
		// Nothing cut off mid-migration.
		expect(counts.failed).toBe(0);
	},
);
