import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import {
	computeTrack,
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { createCheckpointThreadExporter } from "../../../../src/checkpoint/background/createCheckpointThreadExporter.js";
import { decodePartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpointEncoding.js";
import { openSqliteBalanceStateStore } from "../../../../src/state/sqliteBalanceStateStore.js";
import type { CheckpointThreadFixtureConfig } from "../../../fixtures/checkpoint-thread.js";

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
} as const;

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
	const store = openSqliteBalanceStateStore({ databasePath });
	store.initializePartition({ topic, partition: 0, nextOffset: 0n });
	store.applyDurableStateInitialization({
		position: { topic, partition: 0, offset: 0n },
		initialization: {
			schemaVersion: 1,
			type: "state_initialized",
			initializationId: "seed",
			initializedAt: Date.now(),
			state: createCustomerMeteringState({
				identity,
				featureStatesById: {
					messages: {
						kind: "direct_metered_v1",
						customerEntitlements: [
							{
								id: "messages",
								balance: 100,
								usage: 0,
								granted: 100,
								externalId: null,
								planId: null,
								reset: null,
								expiresAt: null,
							},
						],
					},
				},
			}),
		},
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
		const decision = computeTrack({
			state,
			deduplicationExpiresAt: Date.now() + 3_600_000,
			command: parseTrackCommand({
				input: {
					schemaVersion: 1,
					type: "track",
					commandId,
					requestId: commandId,
					identity,
					entityId: null,
					featureId: "messages",
					value: 5,
					overageBehavior: "reject",
					properties: null,
					occurredAt: Date.now(),
				},
			}),
		});
		if (decision.kind !== "new") throw new Error("Expected new track");
		store.applyDurableTrackOutcome({
			position: { topic, partition: 0, offset },
			outcome: decision.outcome,
		});
		return decision.outcome;
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
