import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { createCheckpointThreadExporter } from "../../../../src/checkpoint/background/createCheckpointThreadExporter.js";
import { decodePartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpointEncoding.js";
import { openStateStore } from "../../../../src/state/openStateStore.js";
import type { CheckpointThreadFixtureConfig } from "../../../fixtures/checkpoint-thread.js";
import {
	applyDurableMutation,
	createCustomerEntitlement,
	createInitializeMutation,
	createState,
	createTrackMutation,
} from "../../../fixtures/mutations.js";

export const topic = "checkpoint-background-test";
export const limits = {
	maxStates: 10_000,
	maxReceipts: 10_000,
	maxSerializedBytes: 16 * 1024 * 1024,
};
export const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "customer_1",
	entityId: null,
} as const;

const seedState = createState({
	identity,
	customerEntitlements: [
		createCustomerEntitlement({ id: "messages", balance: 100 }),
	],
});

export const waitForGate = async (
	gate: Int32Array<SharedArrayBuffer>,
): Promise<void> => {
	const deadline = Date.now() + 5_000;
	while (Atomics.load(gate, 0) !== 1) {
		if (Date.now() >= deadline)
			throw new Error("Checkpoint thread did not reach its gate");
		await Bun.sleep(1);
	}
};

export const releaseGate = (gate: Int32Array<SharedArrayBuffer>): void => {
	Atomics.store(gate, 0, 2);
	Atomics.notify(gate, 0);
};

export const createThreadFixture = ({
	pauseAt,
	exitOnce = false,
}: {
	pauseAt?: CheckpointThreadFixtureConfig["pauseAt"];
	exitOnce?: boolean;
} = {}) => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-checkpoint-thread-"));
	const databasePath = join(directory, "balances.sqlite");
	const outputPath = join(directory, "checkpoint.gz");
	const store = openStateStore({ databasePath });
	store.initializePartition({ topic, partition: 0, nextOffset: 0n });
	applyDurableMutation({
		store,
		topic,
		partition: 0,
		offset: 0n,
		mutation: createInitializeMutation({
			state: seedState,
			commandId: "seed",
			deduplicationExpiresAt: Date.now() + 3_600_000,
		}),
	});
	const gate = new Int32Array(
		new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
	);
	let starts = 0;
	const exporter = createCheckpointThreadExporter({
		createWorker: () => {
			const config: CheckpointThreadFixtureConfig = {
				databasePath,
				outputPath,
				limits,
				gate: gate.buffer,
				pauseAt,
				exit: exitOnce && starts === 0,
			};
			starts++;
			return new Worker(
				new URL("../../../fixtures/checkpoint-thread.ts", import.meta.url),
				{ workerData: config },
			);
		},
	});
	const applyTrack = ({
		offset,
		commandId = String(offset),
	}: {
		offset: bigint;
		commandId?: string;
	}) => {
		const state = store.readState({ identity });
		if (!state) throw new Error("Expected customer state");
		const mutation = createTrackMutation({
			state,
			commandId,
			requestId: commandId,
			deduplicationExpiresAt: Date.now() + 3_600_000,
		});
		applyDurableMutation({ store, topic, partition: 0, offset, mutation });
		return mutation;
	};
	return {
		store,
		databasePath,
		outputPath,
		exporter,
		gate,
		applyTrack,
		starts: () => starts,
		readCheckpoint: async () =>
			decodePartitionCheckpoint({
				body: new Uint8Array(await Bun.file(outputPath).arrayBuffer()),
				limits: { ...limits, maxCompressedBytes: limits.maxSerializedBytes },
			}),
		close: async () => {
			releaseGate(gate);
			await exporter.close();
			store.close();
			rmSync(directory, { recursive: true, force: true });
		},
	};
};
