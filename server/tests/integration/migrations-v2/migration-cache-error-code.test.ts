import { afterAll, expect, mock, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const listPath =
	"@/internal/migrations/v2/batchOperations/execute/claim/listItemRunsToPublish.js";
const cachePath =
	"@/internal/migrations/v2/batchOperations/finalize/invalidateBatchMigrationCaches.js";
const repoPath = "@/internal/migrations/v2/repos/index.js";
const originalList = { ...(await import(listPath)) };
const originalCache = { ...(await import(cachePath)) };
const originalRepos = { ...(await import(repoPath)) };
const transitions: { status?: string; error_code?: string | null }[] = [];

mock.module(listPath, () => ({
	...originalList,
	listItemRunsToPublish: async () => [
		{
			customer: {
				internalId: "customer_123",
				id: "public_123",
				name: null,
				email: null,
			},
			migrationRunId: "run_123",
			status: "succeeded",
			skipReason: null,
			changes: [{ kind: "license_pool_repointed" }],
		},
	],
}));
mock.module(cachePath, () => ({
	...originalCache,
	invalidateBatchMigrationCaches: async () => {
		throw new Error("Redis unavailable");
	},
}));
mock.module(repoPath, () => ({
	...originalRepos,
	migrationRunRepo: {
		...originalRepos.migrationRunRepo,
		update: async ({
			updates,
		}: {
			updates: { status?: string; error_code?: string | null };
		}) => {
			transitions.push(updates);
			return null;
		},
	},
	migrationItemRunRepo: {
		...originalRepos.migrationItemRunRepo,
		settleLiveForRun: async () => 0,
	},
}));
afterAll(() => {
	mock.module(listPath, () => originalList);
	mock.module(cachePath, () => originalCache);
	mock.module(repoPath, () => originalRepos);
});

const { publishBatchMigrationChanges } = await import(
	"@/internal/migrations/v2/batchOperations/finalize/publishBatchMigrationChanges.js"
);
const { withMigrationRunTracking } = await import(
	"@/internal/migrations/v2/actions/migrationRun/withMigrationRunTracking.js"
);

test("a final migration Redis failure records cache_invalidation_incomplete", async () => {
	const transaction = { execute: async () => [] };
	const ctx = {
		db: {
			transaction: async (run: (db: typeof transaction) => Promise<unknown>) =>
				run(transaction),
		},
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			debug: () => {},
		},
		features: [],
	} as unknown as AutumnContext;
	const outcome = await withMigrationRunTracking({
		ctx,
		migrationRunId: "run_123",
		migrationInternalId: "migration_123",
		run: () =>
			publishBatchMigrationChanges({
				ctx,
				migrationInternalId: "migration_123",
				migrationRunId: "run_123",
				plan: { patches: [] },
				internalCustomerIds: ["customer_123"],
			}),
	}).then(
		() => null,
		(error: unknown) => error,
	);
	expect(outcome).toBeInstanceOf(Error);
	expect(
		transitions.map(({ status, error_code }) => ({
			status,
			error_code: error_code ?? null,
		})),
	).toEqual([
		{ status: "running", error_code: null },
		{ status: "failed", error_code: "cache_invalidation_incomplete" },
	]);
});
