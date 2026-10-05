/** A page whose checkpoint COMMIT reply is lost must not keep `succeeded`
 * checkpoints with stale caches: the runner busts its caches and releases its claims. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { BatchMigrationPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";
import type { MigrationRuntimeWithEventId } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { createPgResponseFaultProxy } from "./utils/createPgResponseFaultProxy.js";
import {
	migrationTestDatabaseUrl,
	withScratchSchema,
} from "./utils/scratchDatabase.js";

const databaseUrl = migrationTestDatabaseUrl() as string;

const claimModulePath =
	"@/internal/migrations/v2/batchOperations/execute/claim/index.js";
const executeModulePath =
	"@/internal/migrations/v2/batchOperations/execute/executeBatchMigrationPage.js";
const invalidateModulePath =
	"@/internal/migrations/v2/batchOperations/finalize/invalidateBatchMigrationCaches.js";
const cancelTokenModulePath =
	"@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
const constantsModulePath =
	"@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";

const realClaim = { ...(await import(claimModulePath)) };
const realExecute = { ...(await import(executeModulePath)) };
const realInvalidate = { ...(await import(invalidateModulePath)) };
const realCancelToken = { ...(await import(cancelTokenModulePath)) };
const realConstants = { ...(await import(constantsModulePath)) };

const MIGRATION_INTERNAL_ID = "mig_internal_commit_unknown";
const MIGRATION_RUN_ID = "mrun_commit_unknown";
const customers: BatchMigrationPageCustomer[] = ["a", "b"].map((suffix) => ({
	internalId: `cus_internal_${suffix}`,
	id: `cus_${suffix}`,
	name: null,
	email: null,
}));

let executions = 0;
const invalidatedCustomerIds: string[] = [];

mock.module(constantsModulePath, () => ({
	...realConstants,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS: 300,
}));

mock.module(claimModulePath, () => ({
	...realClaim,
	claimNextBatchMigrationPage: async ({
		afterInternalId,
	}: {
		afterInternalId?: string;
	}) =>
		afterInternalId
			? { selectedCount: 0, cursor: afterInternalId, customers: [] }
			: { selectedCount: customers.length, cursor: "cursor_1", customers },
}));

// The page's customer writes and its checkpoints commit together, as the real marks do.
mock.module(executeModulePath, () => ({
	executeBatchMigrationPage: async ({
		ctx,
	}: {
		ctx: { db: import("@/db/initDrizzle.js").DrizzleCli };
	}) => {
		executions++;
		await ctx.db.transaction(async (transaction) => {
			const { sql } = await import("drizzle-orm");
			for (const customer of customers)
				await transaction.execute(
					sql`INSERT INTO migration_runner_customer_writes VALUES (${customer.internalId})`,
				);
			await realClaim.markPageItemRuns({
				db: transaction,
				migrationInternalId: MIGRATION_INTERNAL_ID,
				migrationRunId: MIGRATION_RUN_ID,
				succeededInternalCustomerIds: customers.map(
					(customer) => customer.internalId,
				),
				noUpdatesNeededInternalCustomerIds: [],
				ineligibleInternalCustomerIds: [],
			});
		});
		return {
			succeeded: customers,
			skipped: [],
			insertedItems: [],
			removedItems: [],
			repointedProducts: [],
		};
	},
}));

mock.module(invalidateModulePath, () => ({
	invalidateBatchMigrationCaches: async ({
		pageResult,
	}: {
		pageResult: { succeeded: BatchMigrationPageCustomer[] };
	}) => {
		invalidatedCustomerIds.push(
			...pageResult.succeeded.map((customer) => customer.internalId),
		);
		return pageResult.succeeded.length;
	},
}));

mock.module(cancelTokenModulePath, () => ({
	...realCancelToken,
	isMigrationCancelRequested: async () => false,
}));

const { runBatchMigrationChunk } = await import(
	"@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js"
);
const { MigrationCommitUnknownError } = await import(
	"@/internal/migrations/v2/batchOperations/execute/database/runMigrationTransaction.js"
);

afterAll(() => {
	mock.module(claimModulePath, () => realClaim);
	mock.module(executeModulePath, () => realExecute);
	mock.module(invalidateModulePath, () => realInvalidate);
	mock.module(cancelTokenModulePath, () => realCancelToken);
	mock.module(constantsModulePath, () => realConstants);
});

const SCHEMA = `
	CREATE TABLE migration_runner_customer_writes (item_id text);
	CREATE TABLE migration_item_runs (
		migration_item_run_id text PRIMARY KEY,
		migration_internal_id text NOT NULL,
		migration_run_id text NOT NULL,
		dry_run boolean NOT NULL,
		item_kind text NOT NULL,
		item_id text NOT NULL,
		status text NOT NULL,
		skip_reason text,
		created_at bigint,
		updated_at bigint
	);
`;

const silentLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

describe.skipIf(!databaseUrl)("batch migration runner", () => {
	test("a lost checkpoint COMMIT reply busts caches and releases claims without replaying writes", async () => {
		await withScratchSchema({
			databaseUrl,
			run: async ({ options }) => {
				const admin = new pg.Client({ connectionString: databaseUrl, options });
				await admin.connect();
				const proxy = await createPgResponseFaultProxy({
					fixtureUrl: databaseUrl as string,
					lostCommand: "COMMIT",
				});
				const pool = new pg.Pool({
					connectionString: proxy.connectionString,
					options,
				});
				try {
					await admin.query(SCHEMA);
					for (const customer of customers)
						await admin.query(
							`INSERT INTO migration_item_runs VALUES ($1, $2, $3, false, 'customer', $4, 'running', NULL, 0, NULL)`,
							[
								`mir_${customer.internalId}`,
								MIGRATION_INTERNAL_ID,
								MIGRATION_RUN_ID,
								customer.internalId,
							],
						);

					const outcome = await runBatchMigrationChunk({
						ctx: {
							db: drizzle(pool),
							logger: silentLogger,
							features: [],
							org: { id: "org_test" },
							env: "sandbox",
							// biome-ignore lint/suspicious/noExplicitAny: minimal ctx for the chunk loop
						} as any,
						migration: {
							internal_id: MIGRATION_INTERNAL_ID,
							id: "commit-unknown",
						} as unknown as MigrationRuntimeWithEventId,
						migrationRunId: MIGRATION_RUN_ID,
						plan: { patches: [] } as unknown as BatchMigrationExecutionPlan,
						maxPages: 5,
						timeouts: { pageMs: 5000, recoveryWriteMs: 2000 },
					}).then(
						() => null,
						(error: unknown) => error,
					);

					expect(outcome).toBeInstanceOf(MigrationCommitUnknownError);
					expect(proxy.inspect()).toEqual({
						commits: 2,
						suppressedResponses: 1,
					});
					expect(executions).toBe(1);
					expect(invalidatedCustomerIds.sort()).toEqual(
						customers.map((customer) => customer.internalId).sort(),
					);
					const writes = await admin.query(
						"SELECT item_id FROM migration_runner_customer_writes ORDER BY item_id",
					);
					expect(writes.rows.map((row) => row.item_id)).toEqual(
						customers.map((customer) => customer.internalId),
					);
					const claims = await admin.query(
						"SELECT item_id, status FROM migration_item_runs ORDER BY item_id",
					);
					expect(claims.rows).toEqual(
						customers.map((customer) => ({
							item_id: customer.internalId,
							status: "failed",
						})),
					);
				} finally {
					await proxy.close();
					await pool.end();
					await admin.end();
				}
			},
		});
	}, 15000);
});
