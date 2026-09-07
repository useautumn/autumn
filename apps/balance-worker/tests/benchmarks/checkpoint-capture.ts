import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import {
	computeCheck,
	computeTrack,
	createCustomerMeteringState,
	executeTrack,
	meteringPartitionKeyOf,
	parseTrackCommand,
	stateInitializationFingerprintOf,
} from "@autumn/balance-engine";
import { createCheckpointThreadExporter } from "../../src/checkpoint/background/createCheckpointThreadExporter.js";
import {
	createPartitionCheckpoint,
	type PartitionCheckpointReceiptV1,
	type PartitionCheckpointStateV1,
} from "../../src/checkpoint/partitionCheckpoint.js";
import { encodePartitionCheckpoint } from "../../src/checkpoint/partitionCheckpointEncoding.js";
import { createPartitionCheckpointExporter } from "../../src/checkpoint/partitionCheckpointExporter.js";
import { openSqliteBalanceStateStore } from "../../src/state/sqliteBalanceStateStore.js";
import type { CheckpointThreadFixtureConfig } from "../fixtures/checkpoint-thread.js";

const topic = "checkpoint-benchmark";
const sizes = [100, 1_000, 5_000, 10_000];
const mode = process.argv.includes("--inline") ? "inline" : "background";
const limits = {
	maxSerializedBytes: 16 * 1024 * 1024,
	maxStates: 10_000,
	maxReceipts: 10_000,
};
const quantile = ({
	values,
	fraction,
}: {
	values: number[];
	fraction: number;
}): number => {
	const sorted = [...values].sort((left, right) => left - right);
	return (
		Math.round(
			(sorted[
				Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
			] ?? 0) * 100,
		) / 100
	);
};
const pause = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, 1));

for (const customers of sizes) {
	const directory = mkdtempSync(join(tmpdir(), "autumn-checkpoint-benchmark-"));
	const store = openSqliteBalanceStateStore({
		databasePath: join(directory, "balances.sqlite"),
	});
	const outputPath = join(directory, "checkpoint.gz");
	const exporter =
		mode === "background"
			? createCheckpointThreadExporter({
					createWorker: () => {
						const workerData: CheckpointThreadFixtureConfig = {
							databasePath: join(directory, "balances.sqlite"),
							outputPath,
							limits,
						};
						return new Worker(
							new URL("../fixtures/checkpoint-thread.ts", import.meta.url),
							{ workerData },
						);
					},
				})
			: {
					...createPartitionCheckpointExporter({
						stateStore: store,
						clock: { now: Date.now },
						limits,
						publisher: {
							publish: async ({ checkpoint }) => {
								const { body } = await encodePartitionCheckpoint({
									checkpoint,
									limits: {
										...limits,
										maxCompressedBytes: limits.maxSerializedBytes,
									},
								});
								await Bun.write(outputPath, body);
								return { kind: "published", etag: "inline" };
							},
						},
					}),
					close: async () => {},
				};
	try {
		const now = Date.now();
		const states: PartitionCheckpointStateV1[] = [];
		const receipts: PartitionCheckpointReceiptV1[] = [];
		for (let index = 0; index < customers; index++) {
			const identity = {
				orgId: "benchmark",
				env: "sandbox",
				customerId: `customer_${index}`,
			} as const;
			const state = createCustomerMeteringState({
				identity,
				featureStatesById: {
					messages: {
						kind: "direct_metered_v1",
						customerEntitlements: [
							{
								id: `entitlement_${index}`,
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
			});
			const command = parseTrackCommand({
				input: {
					schemaVersion: 1,
					type: "track",
					commandId: `command_${index}`,
					requestId: `request_${index}`,
					identity,
					entityId: null,
					featureId: "messages",
					value: 5,
					overageBehavior: "reject",
					properties: null,
					occurredAt: now,
				},
			});
			const decision = computeTrack({
				state,
				command,
				deduplicationExpiresAt: now + 3_600_000,
			});
			if (decision.kind !== "new")
				throw new Error("Expected benchmark deduction");
			const partitionKey = meteringPartitionKeyOf({ identity });
			states.push({
				partitionKey,
				initializationId: `initialization_${index}`,
				initializationFingerprint: stateInitializationFingerprintOf({
					initialization: {
						schemaVersion: 1,
						type: "state_initialized",
						initializationId: `initialization_${index}`,
						initializedAt: now,
						state,
					},
				}),
				state: executeTrack({ state, outcome: decision.outcome }).state,
			});
			receipts.push({
				partitionKey,
				recordOffset: BigInt(index),
				outcome: decision.outcome,
			});
		}
		const checkpoint = createPartitionCheckpoint({
			engineSchemaVersion: 1,
			topic,
			partition: 0,
			nextOffset: BigInt(customers),
			createdAt: now,
			states,
			receipts,
		});
		store.restorePartitionCheckpoint({
			checkpoint,
			mode: "restore",
			limits,
			partitionResolver: { partitionForIdentity: () => 0 },
		});
		const identity = {
			orgId: "benchmark",
			env: "sandbox",
			customerId: "hot_customer",
		} as const;
		store.initializePartition({ topic, partition: 1, nextOffset: 0n });
		store.restoreState({
			topic,
			partition: 1,
			initializationId: "hot_initialization",
			state: createCustomerMeteringState({
				identity,
				featureStatesById: {
					messages: {
						kind: "direct_metered_v1",
						customerEntitlements: [
							{
								id: "hot_entitlement",
								balance: 1_000_000,
								usage: 0,
								granted: 1000000,
								externalId: null,
								planId: null,
								reset: null,
								expiresAt: null,
							},
						],
					},
				},
			}),
		});
		let offset = 0n;
		const measureRequest = (): number => {
			const startedAt = performance.now();
			const state = store.readState({ identity });
			if (!state) throw new Error("Missing hot customer");
			const command = parseTrackCommand({
				input: {
					schemaVersion: 1,
					type: "track",
					commandId: `hot_${offset}`,
					requestId: `hot_${offset}`,
					identity,
					entityId: null,
					featureId: "messages",
					value: 1,
					overageBehavior: "reject",
					properties: null,
					occurredAt: Date.now(),
				},
			});
			const decision = computeTrack({
				state,
				command,
				deduplicationExpiresAt: now + 3_600_000,
			});
			if (decision.kind !== "new")
				throw new Error("Expected new hot deduction");
			store.applyDurableTrackOutcome({
				position: { topic, partition: 1, offset: offset++ },
				outcome: decision.outcome,
			});
			const after = store.readState({ identity });
			if (!after) throw new Error("Missing hot customer after track");
			computeCheck({
				state: after,
				command: {
					schemaVersion: 1,
					type: "check",
					requestId: "check",
					identity,
					entityId: null,
					featureId: "messages",
					requiredBalance: 1,
					properties: null,
					occurredAt: Date.now(),
				},
			});
			return performance.now() - startedAt;
		};
		const baseline: number[] = [];
		for (let index = 0; index < 20; index++) baseline.push(measureRequest());
		const captureMs: number[] = [];
		const queuedRequestMs: number[] = [];
		const concurrentRequestMs: number[] = [];
		let bytes = 0;
		const coldStartedAt = performance.now();
		await exporter.export({
			topic,
			partition: 0,
			signal: new AbortController().signal,
		});
		const coldExportMs = performance.now() - coldStartedAt;
		for (let index = 0; index < 5; index++) {
			await pause();
			let exporting = true;
			const sampleRequests = async (): Promise<void> => {
				while (exporting) {
					const queuedAt = performance.now();
					await pause();
					concurrentRequestMs.push(measureRequest());
					queuedRequestMs.push(performance.now() - queuedAt);
				}
			};
			const pendingRequests = sampleRequests();
			const startedAt = performance.now();
			try {
				const result = await exporter.export({
					topic,
					partition: 0,
					signal: new AbortController().signal,
				});
				captureMs.push(performance.now() - startedAt);
				bytes = result.serializedBytes;
			} finally {
				exporting = false;
				await pendingRequests;
			}
		}
		console.log(
			JSON.stringify({
				customers,
				mode,
				receipts: receipts.length,
				serializedBytes: bytes,
				limits,
				coldExportMs: Math.round(coldExportMs * 100) / 100,
				exportP50Ms: quantile({ values: captureMs, fraction: 0.5 }),
				exportMaxMs: quantile({ values: captureMs, fraction: 1 }),
				localTrackAndCheckP50Ms: quantile({ values: baseline, fraction: 0.5 }),
				concurrentRequests: concurrentRequestMs.length,
				concurrentTrackAndCheckP99Ms: quantile({
					values: concurrentRequestMs,
					fraction: 0.99,
				}),
				queuedTrackAndCheckP99Ms: quantile({
					values: queuedRequestMs,
					fraction: 0.99,
				}),
				queuedTrackAndCheckMaxMs: quantile({
					values: queuedRequestMs,
					fraction: 1,
				}),
				note: "File-backed SQLite, engine, gzip and local file publish; excludes Kafka, HTTP and S3 network latency",
			}),
		);
		if (mode === "background" && Math.max(...queuedRequestMs) > 20) {
			throw new Error(
				"Checkpoint capture delayed the serving thread by more than 20ms",
			);
		}
	} finally {
		await exporter.close();
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
}
