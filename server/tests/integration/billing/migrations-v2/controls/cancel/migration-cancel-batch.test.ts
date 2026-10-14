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

		expect(counts.total).toBe(CUSTOMER_COUNT);
		expect(counts.succeeded).toBe(CUSTOMER_COUNT);
		expect(counts.running).toBe(0);
		expect(counts.failed).toBe(0);
	},
);
