// Contract: finite customer tasks share one queue; coordinators do not sleep while holding its only slot.
import { describe, expect, test } from "bun:test";
import {
	createMigrationChunkScheduler,
	getMigrationTriggerOptions,
	MIGRATION_CHUNK_FETCH_SIZE,
	MIGRATION_CHUNK_MAX_DURATION_SECONDS,
	MIGRATION_LAZY_TASK_PRIORITY_SECONDS,
	MIGRATION_RUN_CUSTOMER_CONCURRENCY,
	MIGRATION_SLICE_DURATION_MS,
	MIGRATION_TASK_QUEUE_CONCURRENCY,
	MIGRATION_TASK_RETRY,
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
		expect(MIGRATION_RUN_CUSTOMER_CONCURRENCY).toBe(1);
	});

	test("uses a bounded customer-work slice", () => {
		expect(MIGRATION_SLICE_DURATION_MS).toBe(10_000);
		expect(MIGRATION_CHUNK_FETCH_SIZE).toBe(100);
	});

	test("does not automatically retry checkpointed migration tasks", () => {
		expect(MIGRATION_TASK_RETRY).toEqual({ maxAttempts: 1 });
	});

	test("bounds a stuck chunk and prioritizes request-path customer work", () => {
		expect(MIGRATION_CHUNK_MAX_DURATION_SECONDS).toBe(15 * 60);
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
