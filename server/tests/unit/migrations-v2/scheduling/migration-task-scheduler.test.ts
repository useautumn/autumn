// Contract: finite customer tasks share one queue; coordinators do not sleep while holding its only slot.
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
	MIGRATION_LAZY_TASK_PRIORITY_SECONDS,
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
		expect(MIGRATION_RUN_CUSTOMER_CONCURRENCY).toBe(50);
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
