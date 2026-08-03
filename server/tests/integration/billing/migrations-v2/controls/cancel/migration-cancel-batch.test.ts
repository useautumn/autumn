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
	`${chalk.yellowBright("migration cancel (batch): in-flight page finishes, run settles canceled")}`,
	async () => {
		/**
		 * Contract under test:
		 *   New behaviors:
		 *     - Cancelling a running batch migration is honored at a PAGE
		 *       boundary: the in-flight page finishes in full, then the loop
		 *       exits through the cancel gate instead of running to exhaustion.
		 *     - The run settles to `canceled` (not `succeeded`), with
		 *       "Canceled by user".
		 *   Side effects:
		 *     - No item is left mid-flight (`running`) or `failed` — nothing is
		 *       cut off part-way through its migration.
		 *
		 * CUSTOMER_COUNT is deliberately below BATCH_MIGRATION_PAGE_SIZE, so the
		 * whole scope is one page and the claim upsert marks every customer
		 * `running` in a single statement. A partial `total` is therefore not
		 * reachable here; page-granular cancellation is what's asserted instead.
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

		// Wait until the page is claimed, then cancel while it executes so the
		// loop's next cancel check — after the page commits — sees the request.
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

		const cancel = await autumnV2_2.migrationsV2.cancelRun({
			id: migration.id,
		});
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

		// The in-flight page finished in full — the run stopped at the boundary
		// after it, not part-way through it.
		expect(counts.total).toBe(CUSTOMER_COUNT);
		expect(counts.succeeded).toBe(CUSTOMER_COUNT);
		// Nothing cut off mid-migration.
		expect(counts.running).toBe(0);
		expect(counts.failed).toBe(0);
	},
);
