import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createPartitionCheckpoint,
	PartitionCheckpointContentHashMismatchError,
} from "../../../../src/checkpoint/partitionCheckpoint.js";
import { PartitionCheckpointSourceError } from "../../../../src/checkpoint/partitionCheckpointSource.js";
import {
	createPartitionBootstrapper,
	PartitionBootstrapRefusedError,
} from "../../../../src/runtime/bootstrap/partitionBootstrap.js";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../../src/state/sqliteBalanceStateStore.js";

const topic = "metering-events-v1";
const partition = 0;
const restoreLimits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 100,
	maxReceipts: 1_000,
};
const retryPolicy = {
	maxAttempts: 3,
	initialBackoffMs: 10,
	maxBackoffMs: 50,
};

const checkpointAt = (nextOffset: bigint) =>
	createPartitionCheckpoint({
		engineSchemaVersion: 1,
		createdAt: 1_700_000_000_000,
		topic,
		partition,
		nextOffset,
		states: [],
		receipts: [],
	});

const createStore = (): {
	directory: string;
	store: SqliteBalanceStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-bootstrap-"));
	return {
		directory,
		store: openSqliteBalanceStateStore({
			databasePath: join(directory, "balance-state.sqlite"),
		}),
	};
};

const closeStore = ({
	directory,
	store,
}: {
	directory: string;
	store: SqliteBalanceStateStore;
}): void => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};

const createBootstrapper = ({
	store,
	latest,
	sleep = async () => undefined,
}: {
	store: SqliteBalanceStateStore;
	latest: (
		signal: AbortSignal,
	) => ReturnType<
		import("../../../../src/checkpoint/partitionCheckpointSource.js").PartitionCheckpointSource["latest"]
	>;
	sleep?: ({
		delayMs,
		signal,
	}: {
		delayMs: number;
		signal: AbortSignal;
	}) => Promise<void>;
}) =>
	createPartitionBootstrapper({
		stateStore: store,
		checkpointSource: {
			latest: ({ signal }) => latest(signal),
		},
		partitionResolver: { partitionForIdentity: () => partition },
		restoreLimits,
		retryPolicy,
		sleep,
	});

describe("partition bootstrap", () => {
	test("continues retained local state without loading a checkpoint", async () => {
		const fixture = createStore();
		let sourceCalls = 0;
		try {
			fixture.store.initializePartition({ topic, partition, nextOffset: 42n });
			const bootstrapper = createBootstrapper({
				store: fixture.store,
				latest: async () => {
					sourceCalls += 1;
					return checkpointAt(80n);
				},
			});

			await expect(
				bootstrapper.bootstrap({
					topic,
					partition,
					logRange: { logStartOffset: 0n, logEndOffset: 100n },
					signal: new AbortController().signal,
				}),
			).resolves.toEqual({ kind: "continued", nextOffset: 42n });
			expect(sourceCalls).toBe(0);
		} finally {
			closeStore(fixture);
		}
	});

	test("restores a retained checkpoint before catch-up", async () => {
		const fixture = createStore();
		try {
			const bootstrapper = createBootstrapper({
				store: fixture.store,
				latest: async () => checkpointAt(100n),
			});

			await expect(
				bootstrapper.bootstrap({
					topic,
					partition,
					logRange: { logStartOffset: 100n, logEndOffset: 120n },
					signal: new AbortController().signal,
				}),
			).resolves.toEqual({ kind: "restored", nextOffset: 100n });
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(100n);
		} finally {
			closeStore(fixture);
		}
	});

	test("replaces local state that fell behind Kafka retention", async () => {
		const fixture = createStore();
		try {
			fixture.store.initializePartition({ topic, partition, nextOffset: 42n });
			const bootstrapper = createBootstrapper({
				store: fixture.store,
				latest: async () => checkpointAt(100n),
			});

			await expect(
				bootstrapper.bootstrap({
					topic,
					partition,
					logRange: { logStartOffset: 100n, logEndOffset: 120n },
					signal: new AbortController().signal,
				}),
			).resolves.toEqual({ kind: "replaced", nextOffset: 100n });
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(100n);
		} finally {
			closeStore(fixture);
		}
	});

	test("retries a transient source failure with bounded backoff", async () => {
		const fixture = createStore();
		const delays: number[] = [];
		let sourceCalls = 0;
		try {
			const bootstrapper = createBootstrapper({
				store: fixture.store,
				latest: async () => {
					sourceCalls += 1;
					if (sourceCalls < 3) {
						throw new PartitionCheckpointSourceError({
							message: "temporary source failure",
							retriable: true,
						});
					}
					return null;
				},
				sleep: async ({ delayMs }) => {
					delays.push(delayMs);
				},
			});

			await expect(
				bootstrapper.bootstrap({
					topic,
					partition,
					logRange: { logStartOffset: 0n, logEndOffset: 0n },
					signal: new AbortController().signal,
				}),
			).resolves.toEqual({ kind: "initialized", nextOffset: 0n });
			expect(sourceCalls).toBe(3);
			expect(delays).toEqual([10, 20]);
		} finally {
			closeStore(fixture);
		}
	});

	test("does not retry a deterministic retention refusal", async () => {
		const fixture = createStore();
		let sourceCalls = 0;
		try {
			fixture.store.initializePartition({ topic, partition, nextOffset: 42n });
			const bootstrapper = createBootstrapper({
				store: fixture.store,
				latest: async () => {
					sourceCalls += 1;
					return checkpointAt(90n);
				},
			});

			await expect(
				bootstrapper.bootstrap({
					topic,
					partition,
					logRange: { logStartOffset: 100n, logEndOffset: 120n },
					signal: new AbortController().signal,
				}),
			).rejects.toBeInstanceOf(PartitionBootstrapRefusedError);
			expect(sourceCalls).toBe(1);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(42n);
		} finally {
			closeStore(fixture);
		}
	});

	test("does not retry an invalid checkpoint", async () => {
		const fixture = createStore();
		let sourceCalls = 0;
		try {
			const checkpoint = checkpointAt(100n);
			checkpoint.contentHash = "0".repeat(64);
			const bootstrapper = createBootstrapper({
				store: fixture.store,
				latest: async () => {
					sourceCalls += 1;
					return checkpoint;
				},
			});

			await expect(
				bootstrapper.bootstrap({
					topic,
					partition,
					logRange: { logStartOffset: 100n, logEndOffset: 120n },
					signal: new AbortController().signal,
				}),
			).rejects.toBeInstanceOf(PartitionCheckpointContentHashMismatchError);
			expect(sourceCalls).toBe(1);
			expect(fixture.store.readNextOffset({ topic, partition })).toBeNull();
		} finally {
			closeStore(fixture);
		}
	});

	test("cancels checkpoint loading before it can mutate SQLite", async () => {
		const fixture = createStore();
		const abortController = new AbortController();
		let resolveCheckpoint = (
			_checkpoint: ReturnType<typeof checkpointAt>,
		): void => undefined;
		const checkpointLoaded = new Promise<ReturnType<typeof checkpointAt>>(
			(resolve) => {
				resolveCheckpoint = resolve;
			},
		);
		try {
			const bootstrapper = createBootstrapper({
				store: fixture.store,
				latest: async () => checkpointLoaded,
			});
			const bootstrap = bootstrapper.bootstrap({
				topic,
				partition,
				logRange: { logStartOffset: 100n, logEndOffset: 120n },
				signal: abortController.signal,
			});
			await Promise.resolve();
			const revoked = new Error("assignment revoked");
			abortController.abort(revoked);
			resolveCheckpoint(checkpointAt(100n));

			await expect(bootstrap).rejects.toBe(revoked);
			expect(fixture.store.readNextOffset({ topic, partition })).toBeNull();
		} finally {
			closeStore(fixture);
		}
	});
});
