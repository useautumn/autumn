import { afterEach, describe, expect, test } from "bun:test";
import {
	_getActiveDelayedPostgresBackupReadsForTesting,
	_resetDelayedPostgresBackupReadsForTesting,
	runWithDelayedPostgresBackupRead,
} from "@/internal/customers/repos/getFullSubject/runWithDelayedPostgresBackupRead.js";

const wait = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const deferred = <T>() => {
	let resolvePromise!: (value: T) => void;
	let rejectPromise!: (reason: unknown) => void;
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
};

afterEach(() => {
	_resetDelayedPostgresBackupReadsForTesting();
});

describe("runWithDelayedPostgresBackupRead", () => {
	test("returns a fast primary result without starting a duplicate read", async () => {
		let backupCalls = 0;
		const events: string[] = [];

		const result = await runWithDelayedPostgresBackupRead({
			primaryFn: async () => "primary",
			backupFn: async () => {
				backupCalls++;
				return "backup";
			},
			delayMs: 20,
			maxInFlightBackups: 1,
			onEvent: (event) => events.push(event),
		});
		await wait(30);

		expect(result).toBe("primary");
		expect(backupCalls).toBe(0);
		expect(events).toEqual([]);
		expect(_getActiveDelayedPostgresBackupReadsForTesting()).toBe(0);
	});

	test("returns the backup result when a slow primary crosses the delay", async () => {
		const primary = deferred<string>();
		const events: string[] = [];

		const result = await runWithDelayedPostgresBackupRead({
			primaryFn: () => primary.promise,
			backupFn: async () => "backup",
			delayMs: 10,
			maxInFlightBackups: 1,
			onEvent: (event) => events.push(event),
		});
		primary.resolve("late-primary");
		await wait(0);

		expect(result).toBe("backup");
		expect(events).toEqual(["started", "backup_won"]);
		expect(_getActiveDelayedPostgresBackupReadsForTesting()).toBe(0);
	});

	test("returns the primary when it wins after the duplicate starts", async () => {
		const primary = deferred<string>();
		const backup = deferred<string>();
		const events: string[] = [];

		const resultPromise = runWithDelayedPostgresBackupRead({
			primaryFn: () => primary.promise,
			backupFn: () => backup.promise,
			delayMs: 10,
			maxInFlightBackups: 1,
			onEvent: (event) => events.push(event),
		});
		await wait(20);
		expect(_getActiveDelayedPostgresBackupReadsForTesting()).toBe(1);

		primary.resolve("primary");
		expect(await resultPromise).toBe("primary");
		expect(events).toEqual(["started", "primary_won"]);
		// The capacity slot tracks the still-running duplicate, not the caller.
		expect(_getActiveDelayedPostgresBackupReadsForTesting()).toBe(1);

		backup.resolve("late-backup");
		await wait(0);
		expect(_getActiveDelayedPostgresBackupReadsForTesting()).toBe(0);
	});

	test("starts the duplicate immediately after an eligible primary failure", async () => {
		const primaryError = new Error("connection reset");
		const events: string[] = [];

		const result = await runWithDelayedPostgresBackupRead({
			primaryFn: async () => {
				throw primaryError;
			},
			backupFn: async () => "backup",
			delayMs: 10_000,
			maxInFlightBackups: 1,
			shouldStartBackupOnError: (error) => error === primaryError,
			onEvent: (event) => events.push(event),
		});

		expect(result).toBe("backup");
		expect(events).toEqual(["started", "backup_won"]);
	});

	test("does not bypass load shedding or retry deterministic primary failures", async () => {
		const primaryError = new Error("gate rejected");
		let backupCalls = 0;

		const error = await runWithDelayedPostgresBackupRead({
			primaryFn: async () => {
				throw primaryError;
			},
			backupFn: async () => {
				backupCalls++;
				return "backup";
			},
			delayMs: 10_000,
			maxInFlightBackups: 1,
			shouldStartBackupOnError: () => false,
		}).catch((caught) => caught);

		expect(error).toBe(primaryError);
		expect(backupCalls).toBe(0);
	});

	test("preserves the primary error when both independent reads fail", async () => {
		const primaryError = new Error("primary connection reset");
		const backupError = new Error("backup connection reset");
		const events: string[] = [];

		const error = await runWithDelayedPostgresBackupRead({
			primaryFn: async () => {
				throw primaryError;
			},
			backupFn: async () => {
				throw backupError;
			},
			delayMs: 10_000,
			maxInFlightBackups: 1,
			shouldStartBackupOnError: () => true,
			onEvent: (event) => events.push(event),
		}).catch((caught) => caught);

		expect(error).toBe(primaryError);
		expect(events).toEqual(["started", "both_failed"]);
		expect(_getActiveDelayedPostgresBackupReadsForTesting()).toBe(0);
	});

	test("skips rather than queues when the per-process duplicate cap is full", async () => {
		const firstPrimary = deferred<string>();
		const firstBackup = deferred<string>();
		const secondPrimary = deferred<string>();
		let backupCalls = 0;
		const secondEvents: string[] = [];

		const firstResult = runWithDelayedPostgresBackupRead({
			primaryFn: () => firstPrimary.promise,
			backupFn: () => {
				backupCalls++;
				return firstBackup.promise;
			},
			delayMs: 10,
			maxInFlightBackups: 1,
		});
		await wait(20);
		expect(_getActiveDelayedPostgresBackupReadsForTesting()).toBe(1);

		const secondResult = runWithDelayedPostgresBackupRead({
			primaryFn: () => secondPrimary.promise,
			backupFn: async () => {
				backupCalls++;
				return "second-backup";
			},
			delayMs: 10,
			maxInFlightBackups: 1,
			onEvent: (event) => secondEvents.push(event),
		});
		await wait(20);
		secondPrimary.resolve("second-primary");

		expect(await secondResult).toBe("second-primary");
		expect(backupCalls).toBe(1);
		expect(secondEvents).toEqual(["skipped_capacity"]);

		firstBackup.resolve("first-backup");
		expect(await firstResult).toBe("first-backup");
		firstPrimary.resolve("late-first-primary");
		await wait(0);
		expect(_getActiveDelayedPostgresBackupReadsForTesting()).toBe(0);
	});

	test("supports empty, large, and special-character results without transforming them", async () => {
		const values = ["", "x".repeat(1024 * 1024), "emoji 🚀 null\0 quotes '\""];

		for (const value of values) {
			const result = await runWithDelayedPostgresBackupRead({
				primaryFn: async () => value,
				backupFn: async () => "unused",
				delayMs: 10,
				maxInFlightBackups: 1,
			});
			expect(result).toBe(value);
		}
	});
});
