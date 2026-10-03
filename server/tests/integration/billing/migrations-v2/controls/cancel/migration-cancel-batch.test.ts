import { expect, test } from "bun:test";
import { MigrationRunStatus } from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { withMigrationRunClaim } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import {
	migrationItemRunRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";

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

		// In-process run with one page per chunk: cancel_run lands on the live
		// run after page 1 commits, so the next chunk's cancel gate always sees it.
		const { migrationRunId } = await withMigrationRunClaim({
			ctx,
			migration,
			dryRun: false,
			claimed: async () => undefined,
		});
		let cancelResponse: { canceled: boolean } | undefined;
		const result = await runMigrationInChunks({
			ctx,
			migration,
			migrationRunId,
			dryRun: false,
			runBatchChunk: async (payload) => {
				const chunkResult = await runBatchMigrationChunk({
					ctx,
					migration: payload.migration,
					migrationRunId: payload.migrationRunId,
					plan: payload.plan,
					afterInternalId: payload.cursor,
					maxPages: 1,
					webhooks: payload.webhooks,
					controls: payload.controls,
				});
				cancelResponse ??= await autumnV2_2.migrationsV2.cancelRun({
					id: migration.id,
				});
				return chunkResult;
			},
		});

		expect(cancelResponse?.canceled).toBe(true);
		expect(result.lane).toBe("batch");
		expect(result.canceled).toBe(true);

		const [run] = await migrationRunRepo.list({
			ctx,
			internalId: migrationRunId,
		});
		expect(run.status).toBe(MigrationRunStatus.Canceled);
		expect(run.error_message).toBe("Canceled by user");

		const counts = await migrationItemRunRepo.getCounts({
			ctx,
			migrationInternalId: migration.internal_id,
			dryRun: false,
			migrationRunId,
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
