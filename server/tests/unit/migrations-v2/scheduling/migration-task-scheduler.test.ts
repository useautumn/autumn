// Contract: all migration tasks share one queue; contention checkpoints, while an idle queue continues immediately.
// Queue inspection failure is conservative and checkpoints rather than monopolising migration execution.
import { describe, expect, test } from "bun:test";
import {
	createMigrationTaskScheduler,
	getMigrationTriggerOptions,
	MIGRATION_SLICE_DURATION_MS,
	MIGRATION_YIELD_SECONDS,
	migrationTaskQueue,
} from "@/trigger/migrations/migrationTaskQueue.js";

const logger = {
	info: () => {},
	warn: () => {},
};

describe("migration task scheduler", () => {
	test("defines one fleet-wide queue with a conservative initial limit", () => {
		expect(migrationTaskQueue.name).toBe("migration-customer-work");
		expect(migrationTaskQueue.concurrencyLimit).toBe(1);
	});

	test("keeps the active slice longer than the checkpoint wait", () => {
		expect(MIGRATION_YIELD_SECONDS).toBeGreaterThan(5);
		expect(MIGRATION_SLICE_DURATION_MS).toBeGreaterThan(
			MIGRATION_YIELD_SECONDS * 1000,
		);
	});

	test("does not partition migration runs into per-org queues", () => {
		expect(getMigrationTriggerOptions({ isDev: false })).toEqual({});
		expect(getMigrationTriggerOptions({ isDev: true })).toEqual({
			region: "eu-central-1",
		});
	});

	test("continues without checkpointing when no other migration work is queued", async () => {
		let checkpointCount = 0;
		const scheduler = createMigrationTaskScheduler({
			logger,
			getQueuedCount: async () => 0,
			checkpoint: async () => {
				checkpointCount++;
			},
		});

		await scheduler.onSliceComplete();

		expect(checkpointCount).toBe(0);
	});

	test("checkpoints when another migration task is queued", async () => {
		let checkpointCount = 0;
		const scheduler = createMigrationTaskScheduler({
			logger,
			getQueuedCount: async () => 1,
			checkpoint: async () => {
				checkpointCount++;
			},
		});

		await scheduler.onSliceComplete();

		expect(checkpointCount).toBe(1);
	});

	test("checkpoints when queue inspection fails", async () => {
		let checkpointCount = 0;
		const scheduler = createMigrationTaskScheduler({
			logger,
			getQueuedCount: async () => {
				throw new Error("queue unavailable");
			},
			checkpoint: async () => {
				checkpointCount++;
			},
		});

		await scheduler.onSliceComplete();

		expect(checkpointCount).toBe(1);
	});
});
