import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { createProducerSession, serializeMeteringRecord } from "@autumn/kafka";
import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { Kafka, logLevel } from "kafkajs";
import { createPartitionCheckpointScheduler } from "../../../src/checkpoint/scheduling/partitionCheckpointScheduler.js";
import { defaultPartitionCheckpointSchedulerConfig } from "../../../src/checkpoint/scheduling/partitionCheckpointSchedulerConfig.js";
import { createPartitionRuntimeFactory } from "../../../src/init/construction/createPartitionRuntimeFactory.js";
import { createWorkerPartitions } from "../../../src/init/construction/createWorkerPartitions.js";
import {
	createWorkerConsumerConfig,
	createWorkerProducerConfig,
} from "../../../src/init/workerConfig.js";
import type { PartitionRuntime } from "../../../src/runtime/types/partitionRuntime.js";
import { createS3CheckpointThreadExporter } from "../../../src/s3/background/createS3CheckpointThreadExporter.js";
import type { S3CheckpointThreadConfig } from "../../../src/s3/background/s3CheckpointThreadConfig.js";
import { createS3CheckpointObjectClient } from "../../../src/s3/s3CheckpointObjectClient.js";
import {
	createS3PartitionCheckpointStorage,
	partitionCheckpointObjectKeyOf,
} from "../../../src/s3/s3PartitionCheckpointStorage.js";
import { openSqliteBalanceStateStore } from "../../../src/state/sqliteBalanceStateStore.js";

const timings = {
	fetchMaxWaitTimeMs: 100,
	healthRefreshIntervalMs: 1_000,
	heartbeatIntervalMs: 3_000,
	recoveryDrainTimeoutMs: 5_000,
	rebalanceTimeoutMs: 60_000,
	sessionTimeoutMs: 30_000,
};
const producerLimits = {
	transactionTimeoutMs: 10_000,
	retryCount: 2,
	initialRetryTimeMs: 100,
	maxRetryTimeMs: 1_000,
};
const checkpointLimits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 100,
	maxReceipts: 1_000,
};

const waitUntil = async ({ ready }: { ready(): boolean }): Promise<void> => {
	const deadline = Date.now() + 10_000;
	while (!ready()) {
		if (Date.now() >= deadline)
			throw new Error("Timed out waiting for scheduled checkpoint recovery");
		await new Promise<void>((resolve) => setTimeout(resolve, 10));
	}
};

const createOwner = ({
	kafka,
	topic,
	ownershipTopic,
	environment,
	directory,
	name,
	storage,
	checkpointThread,
}: {
	kafka: Kafka;
	topic: string;
	ownershipTopic: string;
	environment: string;
	directory: string;
	name: string;
	storage: ReturnType<typeof createS3PartitionCheckpointStorage>;
	checkpointThread: Omit<S3CheckpointThreadConfig, "databasePath">;
}) => {
	const store = openSqliteBalanceStateStore({
		databasePath: join(directory, `${name}.sqlite`),
	});
	const exporter = createS3CheckpointThreadExporter({
		...checkpointThread,
		databasePath: join(directory, `${name}.sqlite`),
	});
	const scheduler = createPartitionCheckpointScheduler({
		stateStore: store,
		exporter,
		config: {
			...defaultPartitionCheckpointSchedulerConfig,
			intervalMs: 50,
			jitterRatio: 0,
			pollIntervalMs: 10,
		},
	});
	const partitionOffsets = kafka.admin();
	const factory = createPartitionRuntimeFactory({
		ctx: {
			kafka,
			ownershipOffsets: partitionOffsets,
			stateStore: store,
			checkpointSource: storage,
			partitionResolver: { partitionForIdentity: () => 0 },
			checkpointMaintenance: scheduler,
		},
		config: {
			deploymentEnvironment: environment,
			ownership: { topic: ownershipTopic, endpoint: `http://${name}.test` },
			checkpointRestoreLimits: checkpointLimits,
			checkpointRetryPolicy: {
				maxAttempts: 3,
				initialBackoffMs: 10,
				maxBackoffMs: 100,
			},
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 1_000,
				maxPendingCommandsPerCustomer: 100,
			},
			trackReceiptRetentionMs: 3_600_000,
			producerLimits,
			timings,
		},
	});
	const runtimes = new Map<number, PartitionRuntime>();
	const errors: unknown[] = [];
	const group = createWorkerPartitions({
		ctx: {
			consumer: kafka.consumer(
				createWorkerConsumerConfig({
					groupId: `${environment}-${name}`,
					timings,
				}),
			),
			partitionOffsets,
			stateStore: store,
			createRuntime: (assignment) => {
				const resources = factory(assignment);
				runtimes.set(assignment.partition, resources.runtime);
				return resources;
			},
			onError: ({ cause }) => errors.push(cause),
			onUnhealthyPartition: () => {},
		},
		config: {
			topic,
			partitionsConsumedConcurrently: 1,
			healthRefreshIntervalMs: timings.healthRefreshIntervalMs,
		},
	});
	return {
		store,
		scheduler,
		group,
		errors,
		start: async () => {
			await group.start();
			await waitUntil({
				ready: () =>
					errors.length > 0 || runtimes.get(0)?.getStatus() === "ready",
			});
			if (errors[0]) throw errors[0];
			const runtime = runtimes.get(0);
			if (!runtime) throw new Error("Expected ready runtime");
			return runtime;
		},
		close: async () => {
			await scheduler.stop();
			await group.stop();
			await exporter.close();
			store.close();
		},
	};
};

describe("automatic checkpoint recovery", () => {
	test.each([{ tail: false }, { tail: true }])(
		"restores after retained history is removed (tail: $tail)",
		async ({ tail }) => {
			const runId = `checkpoint-${crypto.randomUUID().replaceAll("-", "")}`;
			const topic = runId;
			const ownershipTopic = `${runId}-owners`;
			const bucket = runId;
			const directory = mkdtempSync(
				join(tmpdir(), "autumn-scheduled-recovery-"),
			);
			const kafka = new Kafka({
				clientId: runId,
				brokers: (process.env.KAFKA_BROKERS ?? "127.0.0.1:19092").split(","),
				logLevel: logLevel.NOTHING,
				retry: { retries: 2 },
			});
			const admin = kafka.admin();
			const clientConfig = {
				endpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:19000",
				region: "us-east-1",
				forcePathStyle: true,
				credentials: {
					accessKeyId: "autumn-test",
					secretAccessKey: "autumn-test-secret",
				},
				maxAttempts: 1,
				requestChecksumCalculation: "WHEN_REQUIRED" as const,
				responseChecksumValidation: "WHEN_REQUIRED" as const,
			};
			const s3 = new S3Client(clientConfig);
			const checkpointThread: Omit<S3CheckpointThreadConfig, "databasePath"> = {
				client: clientConfig,
				checkpointLimits,
				storage: {
					bucket,
					keyPrefix: "checkpoints",
					deploymentEnvironment: runId,
					limits: {
						...checkpointLimits,
						maxCompressedBytes: 1_000_000,
						maxPublishAttempts: 3,
					},
				},
			};
			const storage = createS3PartitionCheckpointStorage({
				client: createS3CheckpointObjectClient({ client: s3 }),
				bucket,
				keyPrefix: "checkpoints",
				deploymentEnvironment: runId,
				limits: {
					...checkpointLimits,
					maxCompressedBytes: 1_000_000,
					maxPublishAttempts: 3,
				},
			});
			const owners: ReturnType<typeof createOwner>[] = [];
			const seedProducer = createProducerSession({
				ctx: { kafka },
				config: createWorkerProducerConfig({
					deploymentEnvironment: runId,
					topic,
					partition: 0,
					limits: producerLimits,
				}),
			});
			try {
				await admin.connect();
				await admin.createTopics({
					waitForLeaders: true,
					topics: [
						{ topic, numPartitions: 1, replicationFactor: 1 },
						{
							topic: ownershipTopic,
							numPartitions: 1,
							replicationFactor: 1,
							configEntries: [{ name: "cleanup.policy", value: "compact" }],
						},
					],
				});
				await s3.send(new CreateBucketCommand({ Bucket: bucket }));
				await seedProducer.connect();
				const identity = {
					orgId: "org_1",
					env: "sandbox",
					customerId: "customer_1",
				} as const;
				const state = createCustomerMeteringState({
					identity,
					featureStatesById: {
						messages: {
							kind: "direct_metered_v1",
							customerEntitlements: [{ id: "messages", balance: 10, usage: 0 }],
						},
					},
				});
				const transaction = await seedProducer.transaction();
				await transaction.send({
					topic,
					acks: -1,
					messages: [
						{
							...serializeMeteringRecord({
								record: {
									schemaVersion: 1,
									type: "state_initialized",
									initializationId: "seed",
									initializedAt: Date.now(),
									state,
								},
							}),
							partition: 0,
						},
					],
				});
				await transaction.commit();
				await seedProducer.disconnect();
				const seedEnd = BigInt(
					(await admin.fetchTopicOffsets(topic))[0]?.high ?? "0",
				);
				const first = createOwner({
					kafka,
					topic,
					ownershipTopic,
					environment: runId,
					directory,
					name: "first",
					storage,
					checkpointThread,
				});
				owners.push(first);
				const firstRuntime = await first.start();
				await waitUntil({
					ready: () =>
						(first.group.partitions()[0]?.checkpoint?.lastConfirmedNextOffset ??
							0n) >= seedEnd,
				});
				await first.scheduler.stop();
				const checkpoint = await storage.latest({
					topic,
					partition: 0,
					signal: new AbortController().signal,
				});
				expect(checkpoint?.nextOffset).toBe(seedEnd);
				expect(
					first.store.readNextOffset({ topic, partition: 0 }),
				).toBeLessThan(seedEnd);
				expect(checkpoint?.receipts).toEqual([]);
				const command = parseTrackCommand({
					input: {
						schemaVersion: 1,
						type: "track",
						commandId: "tail",
						requestId: "tail_request",
						identity,
						entityId: null,
						featureId: "messages",
						value: 5,
						overageBehavior: "reject",
						properties: null,
						occurredAt: Date.now(),
					},
				});
				if (tail)
					await firstRuntime.process((processor) =>
						processor.track({ command }),
					);
				const expected = first.store.readState({ identity });
				await first.group.stop();
				await admin.deleteTopicRecords({
					topic,
					partitions: [{ partition: 0, offset: seedEnd.toString() }],
				});
				expect(
					BigInt((await admin.fetchTopicOffsets(topic))[0]?.low ?? "0"),
				).toBe(seedEnd);
				const replacement = createOwner({
					kafka,
					topic,
					ownershipTopic,
					environment: runId,
					directory,
					name: "replacement",
					storage,
					checkpointThread,
				});
				owners.push(replacement);
				const replacementRuntime = await replacement.start();
				expect(replacement.store.readState({ identity })).toEqual(expected);
				if (tail) {
					await expect(
						replacementRuntime.process((processor) =>
							processor.track({ command }),
						),
					).resolves.toMatchObject({ kind: "duplicate" });
					expect(replacement.store.readState({ identity })).toEqual(expected);
				}
				expect([...first.errors, ...replacement.errors]).toEqual([]);
			} finally {
				for (const owner of owners) await owner.close();
				await seedProducer.disconnect().catch(() => undefined);
				await admin
					.deleteTopics({ topics: [topic, ownershipTopic] })
					.catch(() => undefined);
				await admin.disconnect();
				const key = partitionCheckpointObjectKeyOf({
					keyPrefix: "checkpoints",
					deploymentEnvironment: runId,
					topic,
					partition: 0,
				});
				await s3
					.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
					.catch(() => undefined);
				await s3
					.send(new DeleteBucketCommand({ Bucket: bucket }))
					.catch(() => undefined);
				s3.destroy();
				rmSync(directory, { recursive: true, force: true });
			}
		},
	);
});
