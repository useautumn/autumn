/**
 * Canceling a batch run mid-migration must stop at a PAGE boundary: the
 * in-flight page completes, no further page is claimed.
 *
 * Contract under test:
 *   - cancel requested after page 1 → the run reports canceled with exactly
 *     page 1's customers processed;
 *   - processed customers keep their migrated item (a canceled run never
 *     rolls back committed pages);
 *   - unprocessed customers are untouched AND unclaimed (no item runs), so a
 *     later run picks them up cleanly.
 *
 * Page size is mocked to 2 so four customers span two pages.
 */

import { afterAll, expect, mock, test } from "bun:test";
import { type ApiCustomerV5, migrationItemRuns } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";
import {
	addWordsOperation,
	WORDS_PER_ROW,
} from "../operation-scope/operationScopeTestUtils";

const constantsPath =
	"@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
const realConstants = await import(constantsPath);
mock.module(constantsPath, () => ({
	...realConstants,
	BATCH_MIGRATION_PAGE_SIZE: 2,
}));

const { runMigrationInChunks } = await import(
	"@/internal/migrations/v2/run/runMigrationInChunks.js"
);
const { runBatchMigrationChunk } = await import(
	"@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js"
);
const { setMigrationCancelRequested } = await import(
	"@/external/redis/actions/migrationCancelToken/migrationCancelToken.js"
);

afterAll(() => {
	mock.module(constantsPath, () => realConstants);
});

test.concurrent(
	`${chalk.yellowBright("batch controls: cancel mid-run stops after the in-flight page")}`,
	async () => {
		const customerIds = [
			"batch-cancel-1",
			"batch-cancel-2",
			"batch-cancel-3",
			"batch-cancel-4",
		];
		const [primaryId, ...otherIds] = customerIds;
		const plan = products.base({ id: "batch-cancel-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: primaryId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers(otherIds.map((id) => ({ id }))),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					...customerIds.map((customerId) =>
						s.billing.attach({ customerId, productId: plan.id }),
					),
				),
			],
		});

		// Unique per execution: item-run history blocks re-deleting a fixed id.
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `batch-cancel-mig-${Date.now().toString(36)}`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: addWordsOperation({ planFilter: { plan_id: plan.id } }),
			no_billing_changes: true,
		});

		const migrationRunId = generateId("mrun");
		const result = await runMigrationInChunks({
			ctx,
			migration,
			migrationRunId,
			dryRun: false,
			// One page per chunk; cancel lands after the first chunk completes —
			// the same signal /migrations.cancel_run sets.
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
				await setMigrationCancelRequested({
					migrationRunId: payload.migrationRunId,
				});
				return chunkResult;
			},
		});

		// ── Contract: canceled at the page boundary, page 1 only ──
		expect(result.lane).toBe("batch");
		expect(result.canceled).toBe(true);
		expect(result.processed).toBe(2);

		// ── Contract: committed page kept, remainder untouched ──
		const customers = await Promise.all(
			customerIds.map((customerId) =>
				autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			),
		);
		const migrated = customers.filter(
			(customer) => customer.balances.words?.remaining === WORDS_PER_ROW,
		);
		expect(migrated).toHaveLength(2);

		// ── Contract: unprocessed customers were never claimed ──
		const itemRuns = await ctx.db
			.select()
			.from(migrationItemRuns)
			.where(
				eq(migrationItemRuns.migration_internal_id, migration.internal_id),
			);
		expect(itemRuns).toHaveLength(2);
		expect(itemRuns.every((run) => run.status === "succeeded")).toBe(true);
	},
);
