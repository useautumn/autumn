import { describe, expect, test } from "bun:test";
import { isTransientDbError } from "@/db/dbUtils.js";
import { BatchMigrationStallError } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import {
	BATCH_MIGRATION_CHUNK_FINALIZE_RESERVE_MS,
	BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS,
	BATCH_MIGRATION_MIN_PAGE_BUDGET_MS,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
	BATCH_MIGRATION_PAGE_TIMEOUT_MS,
} from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { MIGRATION_CHUNK_MAX_DURATION_SECONDS } from "@/trigger/migrations/migrationTaskQueue.js";

describe("batch migration timeout budget", () => {
	const maxDurationMs = MIGRATION_CHUNK_MAX_DURATION_SECONDS * 1000;

	test("the finalize reserve covers one deferred drain plus one bounded checkpoint write", () => {
		expect(BATCH_MIGRATION_CHUNK_FINALIZE_RESERVE_MS).toBeGreaterThanOrEqual(
			BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS +
				BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
		);
	});

	test("a full-length page and the reserve both fit inside the task deadline", () => {
		expect(
			BATCH_MIGRATION_PAGE_TIMEOUT_MS +
				BATCH_MIGRATION_CHUNK_FINALIZE_RESERVE_MS,
		).toBeLessThan(maxDurationMs);
		expect(
			BATCH_MIGRATION_MIN_PAGE_BUDGET_MS +
				BATCH_MIGRATION_CHUNK_FINALIZE_RESERVE_MS,
		).toBeLessThan(maxDurationMs);
	});

	test("a stall is surfaced, not retried as a transient db error", () => {
		const error = new BatchMigrationStallError({
			phase: "page_execute",
			message: "batch-migration: page 8 made no progress for 300000ms",
		});
		expect(isTransientDbError({ error })).toBe(false);
	});
});
