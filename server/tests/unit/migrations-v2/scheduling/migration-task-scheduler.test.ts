// Contract: chunk tasks share one queue copied per run; the parent polls them from its own queue.
import { describe, expect, test } from "bun:test";
import {
	MIGRATION_CHUNK_CONCURRENCY,
	MIGRATION_CHUNK_SIZE,
	MIGRATION_DB_POOL_MAX,
	MIGRATION_RUN_CUSTOMER_CONCURRENCY,
} from "@/internal/migrations/v2/run/utils/migrationRunConstants.js";
import {
	getMigrationTriggerOptions,
	MIGRATION_CHUNK_MAX_DURATION_SECONDS,
	MIGRATION_CHUNK_POLL_SECONDS,
	MIGRATION_LAZY_TASK_PRIORITY_SECONDS,
	MIGRATION_TASK_QUEUE_CONCURRENCY,
	MIGRATION_TASK_RETRY,
	migrationChunkIdempotencyKey,
	migrationTaskQueue,
} from "@/trigger/migrations/migrationTaskQueue.js";

describe("migration task scheduler", () => {
	test("the chunk queue admits a whole run's chunks per concurrency key", () => {
		expect(migrationTaskQueue.name).toBe("migration-customer-work");
		expect(migrationTaskQueue.concurrencyLimit).toBe(
			MIGRATION_TASK_QUEUE_CONCURRENCY,
		);
		expect(MIGRATION_TASK_QUEUE_CONCURRENCY).toBeGreaterThanOrEqual(
			MIGRATION_CHUNK_CONCURRENCY,
		);
		expect(MIGRATION_RUN_CUSTOMER_CONCURRENCY).toBe(50);
	});

	test("the parent polls chunks every few seconds", () => {
		expect(MIGRATION_CHUNK_POLL_SECONDS).toBe(5);
	});

	test("a page's retry gets its own idempotency key", () => {
		const page = { migrationRunId: "mrun_1", pageIndex: 4 };
		expect(migrationChunkIdempotencyKey({ ...page, attempt: 1 })).toBe(
			"migration-chunk:mrun_1:4",
		);
		expect(migrationChunkIdempotencyKey({ ...page, attempt: 2 })).toBe(
			"migration-chunk:mrun_1:4:retry",
		);
	});

	test("sizes the migration DB pool for two connections per in-flight customer", () => {
		expect(MIGRATION_DB_POOL_MAX).toBeGreaterThanOrEqual(
			MIGRATION_RUN_CUSTOMER_CONCURRENCY * 2,
		);
	});

	test("a chunk is one customer page, and a run keeps a few in flight", () => {
		expect(MIGRATION_CHUNK_SIZE).toBe(500);
		expect(MIGRATION_CHUNK_CONCURRENCY).toBe(3);
	});

	test("does not automatically retry checkpointed migration tasks", () => {
		expect(MIGRATION_TASK_RETRY).toEqual({ maxAttempts: 1 });
	});

	test("bounds a stuck chunk and prioritizes request-path customer work", () => {
		expect(MIGRATION_CHUNK_MAX_DURATION_SECONDS).toBe(30 * 60);
		expect(MIGRATION_LAZY_TASK_PRIORITY_SECONDS).toBe(5 * 60);
	});

	test("does not partition migration runs into per-org queues", () => {
		expect(getMigrationTriggerOptions({ isDev: false })).toEqual({});
		expect(getMigrationTriggerOptions({ isDev: true })).toEqual({
			region: "eu-central-1",
		});
	});
});
