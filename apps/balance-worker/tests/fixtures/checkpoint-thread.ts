import { parentPort, threadId, workerData } from "node:worker_threads";
import { runCheckpointThread } from "../../src/checkpoint/background/runCheckpointThread.js";
import { encodePartitionCheckpoint } from "../../src/checkpoint/partitionCheckpointEncoding.js";
import type { PartitionCheckpointLimits } from "../../src/checkpoint/partitionCheckpointLimits.js";
import { capturePartitionCheckpoint } from "../../src/state/checkpoint/capturePartitionCheckpoint.js";
import { openCheckpointReadDatabase } from "../../src/state/checkpoint/openCheckpointReadDatabase.js";
import { readNextOffset } from "../../src/state/sqliteBalanceStateRows.js";

export type CheckpointThreadFixtureConfig = {
	databasePath: string;
	outputPath: string;
	limits: PartitionCheckpointLimits;
	gate?: SharedArrayBuffer;
	pauseAt?: "before_read" | "after_read" | "before_publish";
	exit?: boolean;
};

const config = workerData as CheckpointThreadFixtureConfig;
if (!parentPort) throw new Error("Expected a checkpoint fixture thread");
const database = openCheckpointReadDatabase({
	databasePath: config.databasePath,
});
const pause = (): void => {
	if (!config.gate) return;
	const gate = new Int32Array(config.gate);
	Atomics.store(gate, 0, 1);
	if (Atomics.wait(gate, 0, 1, 5_000) === "timed-out")
		throw new Error("Checkpoint test did not release its gate");
};

runCheckpointThread({
	port: parentPort,
	limits: config.limits,
	stateStore: {
		capturePartitionCheckpoint: (params) => {
			if (config.exit) process.exit(17);
			if (config.pauseAt === "before_read") pause();
			if (config.pauseAt !== "after_read")
				return capturePartitionCheckpoint({ database, ...params });
			return database
				.transaction(() => {
					readNextOffset({
						database,
						topic: params.topic,
						partition: params.partition,
					});
					pause();
					return capturePartitionCheckpoint({ database, ...params });
				})
				.deferred();
		},
	},
	publisher: {
		publish: async ({ checkpoint, signal }) => {
			if (config.pauseAt === "before_publish") pause();
			signal.throwIfAborted();
			const { body } = await encodePartitionCheckpoint({
				checkpoint,
				limits: {
					...config.limits,
					maxCompressedBytes: config.limits.maxSerializedBytes,
				},
			});
			signal.throwIfAborted();
			await Bun.write(config.outputPath, body);
			return { kind: "published", etag: String(threadId) };
		},
	},
});

process.on("exit", () => database.close());
