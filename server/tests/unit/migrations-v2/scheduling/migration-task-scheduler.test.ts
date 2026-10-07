// Contract: finite customer tasks share one queue; coordinators do not sleep while holding its only slot.
import { describe, expect, test } from "bun:test";
import {
	createMigrationChunkScheduler,
	MIGRATION_CHUNK_FETCH_SIZE,
	MIGRATION_DB_POOL_MAX,
	MIGRATION_RUN_CUSTOMER_CONCURRENCY,
	MIGRATION_SLICE_DURATION_MS,
} from "@/internal/migrations/v2/run/utils/migrationRunConstants.js";
import {
	getMigrationTriggerOptions,
	laneCountFromQueueLimit,
	MIGRATION_CHUNK_MAX_DURATION_SECONDS,
	MIGRATION_LAZY_TASK_PRIORITY_SECONDS,
	MIGRATION_MAX_LANES,
	MIGRATION_TASK_QUEUE_CONCURRENCY,
	MIGRATION_TASK_RETRY,
	migrationChunkIdempotencyKey,
	migrationLaneQueue,
	migrationTaskQueue,
} from "@/trigger/migrations/migrationTaskQueue.js";

describe("migration task scheduler", () => {
	test("defines one fleet-wide queue with a conservative initial limit", () => {
		expect(migrationTaskQueue.name).toBe("migration-customer-work");
		expect(migrationTaskQueue.concurrencyLimit).toBe(
			MIGRATION_TASK_QUEUE_CONCURRENCY,
		);
		expect(MIGRATION_TASK_QUEUE_CONCURRENCY).toBe(1);
	});

	test("keeps fleet and per-run concurrency independently tunable", () => {
		expect(MIGRATION_TASK_QUEUE_CONCURRENCY).toBe(1);
		expect(MIGRATION_RUN_CUSTOMER_CONCURRENCY).toBe(100);
	});

	test("keeps in-flight customers within the chunk task's migration DB pool", () => {
		expect(MIGRATION_RUN_CUSTOMER_CONCURRENCY).toBeLessThanOrEqual(
			MIGRATION_DB_POOL_MAX,
		);
	});

	test("fans a run out to the chunk queue's limit, capped and never below serial", () => {
		expect(MIGRATION_MAX_LANES).toBe(8);
		expect(laneCountFromQueueLimit(MIGRATION_TASK_QUEUE_CONCURRENCY)).toBe(1);
		expect(laneCountFromQueueLimit(4)).toBe(4);
		expect(laneCountFromQueueLimit(3.7)).toBe(3);
		expect(laneCountFromQueueLimit(50)).toBe(8);
		expect(laneCountFromQueueLimit(0)).toBe(1);
		expect(laneCountFromQueueLimit(null)).toBe(1);
		expect(laneCountFromQueueLimit(undefined)).toBe(1);
	});

	test("lanes wait on chunks from their own queue, never from the chunk queue", () => {
		expect(migrationLaneQueue.name).not.toBe(migrationTaskQueue.name);
		expect(migrationLaneQueue.concurrencyLimit).toBeGreaterThanOrEqual(
			MIGRATION_MAX_LANES,
		);
	});

	test("serial chunks keep today's idempotency key; lane chunks are scoped by lane", () => {
		expect(
			migrationChunkIdempotencyKey({ migrationRunId: "mrun_1", chunkIndex: 2 }),
		).toBe("migration-chunk:mrun_1:2");
		expect(
			migrationChunkIdempotencyKey({
				migrationRunId: "mrun_1",
				laneIndex: 1,
				chunkIndex: 2,
			}),
		).toBe("migration-chunk:mrun_1:lane1:2");
	});

	test("uses a bounded customer-work slice", () => {
		expect(MIGRATION_SLICE_DURATION_MS).toBe(10_000);
		expect(MIGRATION_CHUNK_FETCH_SIZE).toBe(100);
	});

	test("does not automatically retry checkpointed migration tasks", () => {
		expect(MIGRATION_TASK_RETRY).toEqual({ maxAttempts: 1 });
	});

	test("bounds a stuck chunk and prioritizes request-path customer work", () => {
		expect(MIGRATION_CHUNK_MAX_DURATION_SECONDS).toBe(30 * 60);
		expect(MIGRATION_LAZY_TASK_PRIORITY_SECONDS).toBeGreaterThan(
			MIGRATION_SLICE_DURATION_MS / 1000,
		);
	});

	test("does not partition migration runs into per-org queues", () => {
		expect(getMigrationTriggerOptions({ isDev: false })).toEqual({});
		expect(getMigrationTriggerOptions({ isDev: true })).toEqual({
			region: "eu-central-1",
		});
	});

	test("creates a pure clock-based scheduler with no in-task wait", () => {
		const scheduler = createMigrationChunkScheduler({ now: () => 123 });

		expect(scheduler.sliceDurationMs).toBe(MIGRATION_SLICE_DURATION_MS);
		expect(scheduler.batchSize).toBe(MIGRATION_CHUNK_FETCH_SIZE);
		expect(scheduler.now()).toBe(123);
	});
});
