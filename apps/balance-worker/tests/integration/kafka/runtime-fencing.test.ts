import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTrackCommand } from "@autumn/balance-engine";
import { createProducerSession } from "@autumn/kafka";
import { Kafka, logLevel } from "kafkajs";
import { createTrackOutcomePublisher } from "../../../src/kafka/createTrackOutcomePublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";
import { createPartitionRuntime } from "../../../src/runtime/createPartitionRuntime.js";
import { OwnedPartitionProducerFencedError } from "../../../src/runtime/runtimeErrors.js";
import type { PartitionRuntime } from "../../../src/runtime/types/partitionRuntime.js";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../src/state/sqliteBalanceStateStore.js";
import {
	createState,
	identity,
	partition,
} from "../../unit/kafka/kafka-test-fixtures.js";

function createTestKafka(): Kafka {
	if (!process.env.KAFKA_BROKERS?.trim())
		throw new Error("KAFKA_BROKERS is required for the fencing test");
	const brokers: string[] = [];
	for (const broker of process.env.KAFKA_BROKERS.split(","))
		brokers.push(broker.trim());
	return new Kafka({
		clientId: `runtime-fencing-${crypto.randomUUID()}`,
		brokers,
		logLevel: logLevel.NOTHING,
		connectionTimeout: 3_000,
		requestTimeout: 10_000,
		retry: { retries: 2, initialRetryTime: 100, maxRetryTime: 1_000 },
	});
}

function createTestRuntime({
	kafka,
	topic,
	stateStore,
}: {
	kafka: Kafka;
	topic: string;
	stateStore: SqliteBalanceStateStore;
}): PartitionRuntime {
	const session = createProducerSession({
		ctx: { kafka },
		config: createWorkerProducerConfig({
			deploymentEnvironment: "runtime-fencing-test",
			topic,
			partition,
			limits: {
				transactionTimeoutMs: 10_000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	});
	const producer = createWorkerProducer({
		ctx: { session },
		config: { topic, partition },
	});
	// Replay is covered separately; this test isolates real producer epochs and runtime disposal.
	async function startAndCatchUp(): Promise<void> {}
	async function stop(): Promise<void> {}
	function partitionForIdentity(): number {
		return partition;
	}
	return createPartitionRuntime({
		ctx: {
			stateStore,
			trackReceiptPolicy: { retentionMs: 86_400_000, now: Date.now },
			producer,
			appender: createTrackOutcomePublisher({ ctx: { producer } }),
			follower: { startAndCatchUp, stop },
			partitionResolver: { partitionForIdentity },
		},
		config: {
			topic,
			partition,
			recoveryDrainTimeoutMs: 1_000,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 1_000,
				maxPendingCommandsPerCustomer: 100,
			},
		},
	});
}

async function replacementFencesPreviousRuntime(): Promise<void> {
	const kafka = createTestKafka();
	const topic = `runtime-fencing-${crypto.randomUUID()}`;
	const admin = kafka.admin();
	const directory = mkdtempSync(join(tmpdir(), "autumn-runtime-fencing-"));
	const stores: SqliteBalanceStateStore[] = [];
	const runtimes: PartitionRuntime[] = [];
	const cleanup: unknown[] = [];
	let topicCreated = false;
	try {
		await admin.connect();
		await admin.createTopics({
			waitForLeaders: true,
			topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
		});
		topicCreated = true;
		for (const name of ["previous", "replacement"]) {
			const store = openSqliteBalanceStateStore({
				databasePath: join(directory, `${name}.sqlite`),
			});
			stores.push(store);
			store.initializePartition({ topic, partition, nextOffset: 0n });
			store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state: createState(),
			});
			runtimes.push(createTestRuntime({ kafka, topic, stateStore: store }));
		}
		const [previous, replacement] = runtimes;
		await previous.start();
		await replacement.start();
		const command = parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId: "fenced-owner",
				requestId: "fenced-owner",
				identity,
				entityId: null,
				featureId: "messages",
				value: 5,
				overageBehavior: "reject",
				properties: null,
				occurredAt: 1_700_000_000_000,
			},
		});
		await expect(previous.submitTrack({ command })).rejects.toBeInstanceOf(
			OwnedPartitionProducerFencedError,
		);
		expect(previous.getStatus()).toBe("recovery_required");
		expect(stores[0].readState({ identity })?.revision).toBe(0);
		await previous.stop();
		await expect(replacement.submitTrack({ command })).resolves.toMatchObject({
			kind: "new",
			outcome: { status: "applied", balanceAfter: 5 },
		});
		expect(replacement.getStatus()).toBe("ready");
		expect(stores[1].readState({ identity })?.revision).toBe(1);
	} finally {
		for (const runtime of runtimes) {
			try {
				await runtime.stop();
			} catch (cause) {
				cleanup.push(cause);
			}
			await runtime.waitForQuiescence();
		}
		for (const store of stores) store.close();
		rmSync(directory, { recursive: true, force: true });
		try {
			if (topicCreated) await admin.deleteTopics({ topics: [topic] });
		} finally {
			await admin.disconnect();
		}
	}
	if (cleanup.length > 0)
		throw new AggregateError(cleanup, "Runtime fencing cleanup failed");
}

test(
	"replacement fences the previous runtime and remains writable after predecessor disposal",
	replacementFencesPreviousRuntime,
	30_000,
);
