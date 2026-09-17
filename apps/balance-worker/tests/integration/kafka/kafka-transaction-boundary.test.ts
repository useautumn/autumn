import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMutation, parseTrackCommand } from "@autumn/balance-engine";
import {
	createKafkaClient as balanceWorkerKafkaConfigOf,
	createProducerSession,
	createProgressTracker,
	serializeMeteringRecord,
} from "@autumn/kafka";
import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { Kafka, logLevel, type RecordMetadata } from "kafkajs";
import { createPartitionCheckpointExporter } from "../../../src/checkpoint/partitionCheckpointExporter.js";
import type { PartitionCheckpointSource } from "../../../src/checkpoint/partitionCheckpointSource.js";
import type { KafkaBalanceWorkerTimings } from "../../../src/init/types/partitionRuntimeFactory.js";
import { createWorkerConsumerConfig as balanceWorkerConsumerConfigOf } from "../../../src/init/workerConfig.js";
import { createMutationPublisher } from "../../../src/kafka/createMutationPublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";
import { createMeteringConsumer } from "../../../src/kafka/meteringConsumer/createMeteringConsumer.js";
import { createPartitionBootstrapper } from "../../../src/runtime/bootstrap/createPartitionBootstrapper.js";
import { createPartitionRuntime } from "../../../src/runtime/createPartitionRuntime.js";
import { OwnedPartitionProducerFencedError } from "../../../src/runtime/runtimeErrors.js";
import type { PartitionOutcomeFollowerPort } from "../../../src/runtime/types/partitionRuntime.js";
import { createS3CheckpointObjectClient } from "../../../src/s3/s3CheckpointObjectClient.js";
import {
	createS3PartitionCheckpointStorage,
	partitionCheckpointObjectKeyOf,
} from "../../../src/s3/s3PartitionCheckpointStorage.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import type { StateStore } from "../../../src/state/types/stateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	applyDurableMutation,
	createInitializeMutation,
	restoreSubjectStates,
} from "../../fixtures/mutations.js";
import {
	createKafkaCommittedMutationAppender,
	createKafkaOwnedPartitionGroup,
	createKafkaOwnedPartitionProducer,
	createKafkaOwnedPartitionRuntimeFactory,
	createMutation,
	createOwnedPartitionRuntime,
	createState,
	serializeKafkaMutationRecord,
} from "../../unit/kafka/kafka-test-fixtures.js";

const brokers = (process.env.KAFKA_BROKERS ?? "127.0.0.1:19092").split(",");
const s3Endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:19000";
const partition = 0;
const timings = {
	fetchMaxWaitTimeMs: 250,
	healthRefreshIntervalMs: 5_000,
	heartbeatIntervalMs: 3_000,
	recoveryDrainTimeoutMs: 5_000,
	rebalanceTimeoutMs: 60_000,
	sessionTimeoutMs: 30_000,
} satisfies KafkaBalanceWorkerTimings;

const checkpointConfiguration = {
	checkpointSource: { latest: async () => null },
	checkpointRestoreLimits: {
		maxSerializedBytes: 1_000_000,
		maxStates: 1_000,
		maxReceipts: 10_000,
	},
	checkpointRetryPolicy: {
		maxAttempts: 3,
		initialBackoffMs: 10,
		maxBackoffMs: 100,
	},
};

const uniqueName = ({ prefix }: { prefix: string }): string =>
	`${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;

const createKafka = ({ clientId }: { clientId: string }): Kafka =>
	new Kafka(
		balanceWorkerKafkaConfigOf({
			clientId,
			brokers,
			transport: { logLevel: logLevel.NOTHING },
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	);

const createS3 = (): S3Client =>
	new S3Client({
		region: "us-east-1",
		endpoint: s3Endpoint,
		forcePathStyle: true,
		credentials: {
			accessKeyId: "autumn-test",
			secretAccessKey: "autumn-test-secret",
		},
		maxAttempts: 1,
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});

const createS3Bucket = async ({
	client,
	bucket,
}: {
	client: S3Client;
	bucket: string;
}): Promise<void> => {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 100; attempt += 1) {
		try {
			await client.send(new CreateBucketCommand({ Bucket: bucket }));
			return;
		} catch (error) {
			lastError = error;
			await new Promise<void>((resolve) => setTimeout(resolve, 100));
		}
	}
	throw lastError;
};

const createTopic = async ({ kafka }: { kafka: Kafka }) => {
	const admin = kafka.admin();
	const topic = uniqueName({ prefix: "balance-worker" });
	await admin.connect();
	await admin.createTopics({
		waitForLeaders: true,
		topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
	});
	return {
		topic,
		cleanup: async (): Promise<void> => {
			await admin.deleteTopics({ topics: [topic] }).catch(() => undefined);
			await admin.disconnect();
		},
	};
};

const baseOffsetFrom = ({
	metadata,
}: {
	metadata: RecordMetadata[];
}): bigint => {
	const offset = metadata[0]?.baseOffset ?? metadata[0]?.offset;
	if (typeof offset !== "string") throw new Error("Kafka base offset missing");
	return BigInt(offset);
};

const waitWithin = async <Value>({
	promise,
	timeoutMs,
}: {
	promise: Promise<Value>;
	timeoutMs: number;
}): Promise<Value> => {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error(`Timed out after ${timeoutMs}ms`)),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
};

const waitUntil = async ({
	condition,
	timeoutMs,
}: {
	condition: () => boolean;
	timeoutMs: number;
}): Promise<void> => {
	await waitWithin({
		promise: (async () => {
			while (!condition()) {
				await new Promise<void>((resolve) => setTimeout(resolve, 10));
			}
		})(),
		timeoutMs,
	});
};

const createStore = ({
	topic,
	initializeCustomer = true,
	initializePartition = true,
}: {
	topic: string;
	initializeCustomer?: boolean;
	initializePartition?: boolean;
}) => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-kafka-fence-"));
	const store = openStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	const state = createState();
	if (initializePartition) {
		store.initializePartition({ topic, partition, nextOffset: 0n });
	}
	if (initializeCustomer) {
		if (!initializePartition) {
			throw new Error("Cannot initialize a customer without its partition");
		}
		restoreSubjectStates({ store, topic, partition, states: [state] });
	}
	return {
		store,
		state,
		cleanup: (): void => {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		},
	};
};

const caughtUpFollower = (): PartitionOutcomeFollowerPort => ({
	readLogRange: async () => ({ logStartOffset: 0n, logEndOffset: 0n }),
	startAndCatchUp: async () => undefined,
	readProgress: () => ({ consumedNextOffset: 0n, highWatermark: 0n }),
	stop: async () => undefined,
});

const createTestRuntimeFactory = ({
	kafka,
	deploymentPrefix,
	stateStore,
	checkpointSource = checkpointConfiguration.checkpointSource,
}: {
	kafka: Kafka;
	deploymentPrefix: string;
	stateStore: StateStore;
	checkpointSource?: PartitionCheckpointSource;
}) =>
	createKafkaOwnedPartitionRuntimeFactory({
		kafka,
		deploymentEnvironment: uniqueName({ prefix: deploymentPrefix }),
		stateStore,
		checkpointSource,
		checkpointRestoreLimits: checkpointConfiguration.checkpointRestoreLimits,
		checkpointRetryPolicy: checkpointConfiguration.checkpointRetryPolicy,
		partitionResolver: { partitionForIdentity: () => partition },
		writerLimits: {
			maxBatchSize: 100,
			maxPendingCommands: 1_000,
			maxPendingCommandsPerCustomer: 100,
		},
		trackReceiptRetentionMs: 86_400_000,
		producerLimits: {
			transactionTimeoutMs: 10_000,
			retryCount: 2,
			initialRetryTimeMs: 100,
			maxRetryTimeMs: 1_000,
		},
		timings,
	});

describe("Kafka transaction boundary", () => {
	test("exports to S3, restores, replays the tail, and deduplicates its retry", async () => {
		const kafka = createKafka({
			clientId: uniqueName({ prefix: "checkpoint-restore" }),
		});
		const s3 = createS3();
		const checkpointBucket = uniqueName({ prefix: "checkpoint-restore" });
		const topicFixture = await createTopic({ kafka });
		const storeFixture = createStore({
			topic: topicFixture.topic,
			initializeCustomer: false,
			initializePartition: false,
		});
		const oldOwnerStoreFixture = createStore({
			topic: topicFixture.topic,
			initializeCustomer: false,
			initializePartition: false,
		});
		const seedProducer = createKafkaOwnedPartitionProducer({
			kafka,
			deploymentEnvironment: uniqueName({ prefix: "checkpoint-seed" }),
			topic: topicFixture.topic,
			partition,
			limits: {
				transactionTimeoutMs: 10_000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		});
		const initialization = createInitializeMutation({
			state: storeFixture.state,
			commandId: "init_1",
		});
		const initialState = applyMutation({
			state: null,
			mutation: initialization,
		});
		const firstOutcome = createMutation({ state: initialState });
		const stateAfterFirst = applyMutation({
			state: initialState,
			mutation: firstOutcome,
		});
		const tailOutcome = createMutation({
			state: stateAfterFirst,
			commandId: "cmd_tail",
			requestId: "req_tail",
		});
		const consumer = kafka.consumer(
			balanceWorkerConsumerConfigOf({
				groupId: uniqueName({ prefix: "checkpoint-restore" }),
				timings,
			}),
		);
		const partitionOffsets = kafka.admin();
		let runtime: ReturnType<typeof createOwnedPartitionRuntime> | null = null;
		const errors: unknown[] = [];
		let group: ReturnType<typeof createKafkaOwnedPartitionGroup> | null = null;
		const checkpointStorage = createS3PartitionCheckpointStorage({
			client: createS3CheckpointObjectClient({ client: s3 }),
			bucket: checkpointBucket,
			keyPrefix: "checkpoints",
			deploymentEnvironment: "staging",
			limits: {
				maxCompressedBytes: 1_000_000,
				maxSerializedBytes: 1_000_000,
				maxPublishAttempts: 3,
			},
		});
		try {
			await createS3Bucket({ client: s3, bucket: checkpointBucket });
			await seedProducer.connect();
			const seedTransaction = await seedProducer.transaction();
			const seedMetadata = await seedTransaction.send({
				topic: topicFixture.topic,
				acks: -1,
				messages: [
					{
						...serializeKafkaMutationRecord({ mutation: initialization }),
						partition,
					},
					{
						...serializeKafkaMutationRecord({ mutation: firstOutcome }),
						partition,
					},
				],
			});
			await seedTransaction.commit();
			const seedBaseOffset = baseOffsetFrom({ metadata: seedMetadata });
			const appender = createKafkaCommittedMutationAppender({
				producer: seedProducer,
			});
			const tailAppend = await appender.appendCommitted({
				topic: topicFixture.topic,
				partition,
				outcomes: [tailOutcome],
			});
			oldOwnerStoreFixture.store.initializePartition({
				topic: topicFixture.topic,
				partition,
				nextOffset: seedBaseOffset,
			});
			applyDurableMutation({
				store: oldOwnerStoreFixture.store,
				topic: topicFixture.topic,
				partition,
				offset: seedBaseOffset,
				mutation: initialization,
			});
			applyDurableMutation({
				store: oldOwnerStoreFixture.store,
				topic: topicFixture.topic,
				partition,
				offset: seedBaseOffset + 1n,
				mutation: firstOutcome,
			});
			const exporter = createPartitionCheckpointExporter({
				stateStore: oldOwnerStoreFixture.store,
				publisher: checkpointStorage,
				clock: { now: () => 1_700_000_000_000 },
				limits: checkpointConfiguration.checkpointRestoreLimits,
			});
			await exporter.export({
				topic: topicFixture.topic,
				partition,
				signal: new AbortController().signal,
			});
			const createRuntime = createTestRuntimeFactory({
				kafka,
				deploymentPrefix: "checkpoint-owner",
				stateStore: storeFixture.store,
				checkpointSource: checkpointStorage,
			});
			group = createKafkaOwnedPartitionGroup({
				consumer,
				partitionOffsets,
				topic: topicFixture.topic,
				stateStore: storeFixture.store,
				partitionsConsumedConcurrently: 1,
				healthRefreshIntervalMs: timings.healthRefreshIntervalMs,
				createRuntime: (params) => {
					const createdRuntime = createRuntime(params);
					runtime = createdRuntime;
					return createdRuntime;
				},
				onError: ({ cause }) => errors.push(cause),
				onUnhealthyPartition: () => undefined,
			});

			await group.start();
			await waitUntil({
				condition: () => runtime?.getStatus() === "ready" || errors.length > 0,
				timeoutMs: 10_000,
			});
			if (errors[0]) throw errors[0];
			const readyRuntime = runtime as ReturnType<
				typeof createOwnedPartitionRuntime
			> | null;
			if (!readyRuntime) throw new Error("Expected an owned partition runtime");

			expect(
				storeFixture.store.readState({ identity: initialState.identity }),
			).toEqual(
				applyMutation({ state: stateAfterFirst, mutation: tailOutcome }),
			);
			expect(
				storeFixture.store.readNextOffset({
					topic: topicFixture.topic,
					partition,
				}),
			).toBe(tailAppend.baseOffset + 1n);
			const retryCommand = parseTrackCommand({
				input: {
					schemaVersion: 1,
					type: "track",
					org: {
						config: {
							reverse_deduction_order: false,
							block_overdue_entitlements: false,
							include_past_due: true,
						},
					},
					commandId: "cmd_tail",
					requestId: "req_tail",
					identity: initialState.identity,
					featureId: "messages",
					internalFeatureId: "feat_messages",
					value: 5,
					overageBehavior: "reject",
					properties: null,
					occurredAt: 1_700_000_000_000,
				},
			});
			await expect(
				readyRuntime.process((processor) =>
					processor.track({ command: retryCommand }),
				),
			).resolves.toMatchObject({ kind: "duplicate" });
			expect(
				storeFixture.store.readState({ identity: initialState.identity })
					?.revision,
			).toBe(3);
		} finally {
			await seedProducer.disconnect().catch(() => undefined);
			await group?.stop().catch(() => undefined);
			storeFixture.cleanup();
			oldOwnerStoreFixture.cleanup();
			await topicFixture.cleanup();
			await s3
				.send(
					new DeleteObjectCommand({
						Bucket: checkpointBucket,
						Key: partitionCheckpointObjectKeyOf({
							keyPrefix: "checkpoints",
							deploymentEnvironment: "staging",
							topic: topicFixture.topic,
							partition,
						}),
					}),
				)
				.catch(() => undefined);
			await s3
				.send(new DeleteBucketCommand({ Bucket: checkpointBucket }))
				.catch(() => undefined);
			s3.destroy();
		}
	});

	test("replays a committed state initialization before its first track", async () => {
		const kafka = createKafka({
			clientId: uniqueName({ prefix: "state-seed" }),
		});
		const topicFixture = await createTopic({ kafka });
		const storeFixture = createStore({
			topic: topicFixture.topic,
			initializeCustomer: false,
		});
		const seedProducer = createKafkaOwnedPartitionProducer({
			kafka,
			deploymentEnvironment: uniqueName({ prefix: "state-seed" }),
			topic: topicFixture.topic,
			partition,
			limits: {
				transactionTimeoutMs: 10_000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		});
		const consumer = kafka.consumer(
			balanceWorkerConsumerConfigOf({
				groupId: uniqueName({ prefix: "state-seed" }),
				timings,
			}),
		);
		const partitionOffsets = kafka.admin();
		let runtime: ReturnType<typeof createOwnedPartitionRuntime> | null = null;
		const createRuntime = createTestRuntimeFactory({
			kafka,
			deploymentPrefix: "state-seed-owner",
			stateStore: storeFixture.store,
		});
		const errors: unknown[] = [];
		const group = createKafkaOwnedPartitionGroup({
			consumer,
			partitionOffsets,
			topic: topicFixture.topic,
			stateStore: storeFixture.store,
			partitionsConsumedConcurrently: 1,
			healthRefreshIntervalMs: timings.healthRefreshIntervalMs,
			createRuntime: (params) => {
				const createdRuntime = createRuntime(params);
				runtime = createdRuntime;
				return createdRuntime;
			},
			onError: ({ cause }) => errors.push(cause),
			onUnhealthyPartition: () => undefined,
		});

		try {
			await seedProducer.connect();
			const outcome = createMutation({ state: storeFixture.state });
			const transaction = await seedProducer.transaction();
			await transaction.send({
				topic: topicFixture.topic,
				acks: -1,
				messages: [
					{
						...serializeKafkaMutationRecord({
							mutation: createInitializeMutation({
								state: storeFixture.state,
								commandId: "init_1",
							}),
						}),
						partition,
					},
					{
						...serializeKafkaMutationRecord({ mutation: outcome }),
						partition,
					},
				],
			});
			await transaction.commit();

			await group.start();
			await waitUntil({
				condition: () => runtime?.getStatus() === "ready" || errors.length > 0,
				timeoutMs: 10_000,
			});
			if (errors[0]) throw errors[0];

			expect(
				storeFixture.store.readState({
					identity: storeFixture.state.identity,
				}),
			).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 5 }],
					},
				},
			});
			expect(errors).toEqual([]);
		} finally {
			await seedProducer.disconnect().catch(() => undefined);
			await group.stop().catch(() => undefined);
			storeFixture.cleanup();
			await topicFixture.cleanup();
		}
	});

	test("returns committed base offsets and hides aborted records", async () => {
		const kafka = createKafka({
			clientId: uniqueName({ prefix: "visibility" }),
		});
		const topicFixture = await createTopic({ kafka });
		const producer = createKafkaOwnedPartitionProducer({
			kafka,
			deploymentEnvironment: uniqueName({ prefix: "integration" }),
			topic: topicFixture.topic,
			partition,
			limits: {
				transactionTimeoutMs: 10_000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		});
		const consumer = kafka.consumer(
			balanceWorkerConsumerConfigOf({
				groupId: uniqueName({ prefix: "read-committed" }),
				timings,
			}),
		);
		try {
			await producer.connect();
			const state = createState();
			const outcome = createMutation({ state });
			const serialized = serializeKafkaMutationRecord({ mutation: outcome });
			const abortedTransaction = await producer.transaction();
			const abortedMetadata = await abortedTransaction.send({
				topic: topicFixture.topic,
				acks: -1,
				messages: [{ ...serialized, partition }],
			});
			await abortedTransaction.abort();
			const abortedOffset = baseOffsetFrom({ metadata: abortedMetadata });

			const appender = createKafkaCommittedMutationAppender({ producer });
			const { baseOffset: committedOffset } = await appender.appendCommitted({
				topic: topicFixture.topic,
				partition,
				outcomes: [outcome],
			});

			let resolveRecord:
				| ((record: { offset: bigint; value: Buffer }) => void)
				| null = null;
			const receivedRecord = new Promise<{ offset: bigint; value: Buffer }>(
				(resolve) => {
					resolveRecord = resolve;
				},
			);
			await consumer.connect();
			await consumer.subscribe({
				topics: [topicFixture.topic],
				fromBeginning: true,
			});
			await consumer.run({
				eachMessage: async ({ message }) => {
					if (message.value && resolveRecord) {
						resolveRecord({
							offset: BigInt(message.offset),
							value: message.value,
						});
						resolveRecord = null;
					}
				},
			});
			const received = await waitWithin({
				promise: receivedRecord,
				timeoutMs: 10_000,
			});

			expect(committedOffset).toBeGreaterThan(abortedOffset);
			expect(received.offset).toBe(committedOffset);
			expect(received.value).toEqual(serialized.value);
		} finally {
			await consumer.stop().catch(() => undefined);
			await consumer.disconnect().catch(() => undefined);
			await producer.disconnect().catch(() => undefined);
			await topicFixture.cleanup();
		}
	});

	test("catches up through an aborted-only range without advancing SQLite", async () => {
		const kafka = createKafka({ clientId: uniqueName({ prefix: "catch-up" }) });
		const topicFixture = await createTopic({ kafka });
		const storeFixture = createStore({ topic: topicFixture.topic });
		const seedProducer = createKafkaOwnedPartitionProducer({
			kafka,
			deploymentEnvironment: uniqueName({ prefix: "aborted-seed" }),
			topic: topicFixture.topic,
			partition,
			limits: {
				transactionTimeoutMs: 10_000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		});
		const consumer = kafka.consumer(
			balanceWorkerConsumerConfigOf({
				groupId: uniqueName({ prefix: "catch-up" }),
				timings,
			}),
		);
		const partitionOffsets = kafka.admin();
		let runtime: ReturnType<typeof createOwnedPartitionRuntime> | null = null;
		const createRuntime = createTestRuntimeFactory({
			kafka,
			deploymentPrefix: "catch-up-owner",
			stateStore: storeFixture.store,
		});
		const errors: unknown[] = [];
		const group = createKafkaOwnedPartitionGroup({
			consumer,
			partitionOffsets,
			topic: topicFixture.topic,
			stateStore: storeFixture.store,
			partitionsConsumedConcurrently: 2,
			healthRefreshIntervalMs: timings.healthRefreshIntervalMs,
			createRuntime: (params) => {
				const createdRuntime = createRuntime(params);
				runtime = createdRuntime;
				return createdRuntime;
			},
			onError: ({ cause }) => errors.push(cause),
			onUnhealthyPartition: () => undefined,
		});
		try {
			await seedProducer.connect();
			const state = createState();
			const serialized = serializeKafkaMutationRecord({
				mutation: createMutation({ state }),
			});
			const abortedTransaction = await seedProducer.transaction();
			await abortedTransaction.send({
				topic: topicFixture.topic,
				acks: -1,
				messages: [{ ...serialized, partition }],
			});
			await abortedTransaction.abort();

			await group.start();
			await waitUntil({
				condition: () => runtime?.getStatus() === "ready",
				timeoutMs: 10_000,
			});

			expect(
				storeFixture.store.readNextOffset({
					topic: topicFixture.topic,
					partition,
				}),
			).toBe(0n);
			expect(errors).toEqual([]);
		} finally {
			await seedProducer.disconnect().catch(() => undefined);
			await group.stop().catch(() => undefined);
			storeFixture.cleanup();
			await topicFixture.cleanup();
		}
	});

	test("a replacement runtime fences the previous partition owner", async () => {
		const kafka = createKafka({ clientId: uniqueName({ prefix: "fencing" }) });
		const topicFixture = await createTopic({ kafka });
		const firstStore = createStore({ topic: topicFixture.topic });
		const secondStore = createStore({ topic: topicFixture.topic });
		const deploymentEnvironment = uniqueName({ prefix: "integration" });
		const runtimeOf = ({ store }: { store: typeof firstStore.store }) =>
			createOwnedPartitionRuntime({
				topic: topicFixture.topic,
				partition,
				stateStore: store,
				db: createSyntheticWorkerDb(),
				catalogCache: createTestCatalogCache(),
				producer: createKafkaOwnedPartitionProducer({
					kafka,
					deploymentEnvironment,
					topic: topicFixture.topic,
					partition,
					limits: {
						transactionTimeoutMs: 10_000,
						retryCount: 2,
						initialRetryTimeMs: 100,
						maxRetryTimeMs: 1_000,
					},
				}),
				follower: caughtUpFollower(),
				bootstrapper: {
					bootstrap: async () => ({ kind: "continued", nextOffset: 0n }),
				},
				partitionResolver: { partitionForIdentity: () => partition },
				writerLimits: {
					maxBatchSize: 100,
					maxPendingCommands: 1_000,
					maxPendingCommandsPerCustomer: 100,
				},
				receiptPolicy: { retentionMs: 86_400_000, now: Date.now },
				recoveryDrainTimeoutMs: timings.recoveryDrainTimeoutMs,
			});
		const firstRuntime = runtimeOf({ store: firstStore.store });
		const replacementRuntime = runtimeOf({ store: secondStore.store });
		try {
			await firstRuntime.start();
			await replacementRuntime.start();
			const command = parseTrackCommand({
				input: {
					schemaVersion: 1,
					type: "track",
					org: {
						config: {
							reverse_deduction_order: false,
							block_overdue_entitlements: false,
							include_past_due: true,
						},
					},
					commandId: "cmd_fenced_owner",
					requestId: "req_fenced_owner",
					identity: firstStore.state.identity,
					featureId: "messages",
					internalFeatureId: "feat_messages",
					value: 5,
					overageBehavior: "reject",
					properties: null,
					occurredAt: 1_700_000_000_000,
				},
			});

			await expect(
				waitWithin({
					promise: firstRuntime.process((processor) =>
						processor.track({ command }),
					),
					timeoutMs: 10_000,
				}),
			).rejects.toBeInstanceOf(OwnedPartitionProducerFencedError);
			expect(firstRuntime.getStatus()).toBe("recovery_required");
		} finally {
			await firstRuntime.stop().catch(() => undefined);
			await replacementRuntime.stop().catch(() => undefined);
			firstStore.cleanup();
			secondStore.cleanup();
			await topicFixture.cleanup();
		}
	});
});

function createReplaySession({
	kafka,
	topic,
	store,
}: {
	kafka: Kafka;
	topic: string;
	store: StateStore;
}): PartitionOutcomeFollowerPort {
	const consumer = kafka.consumer(
		balanceWorkerConsumerConfigOf({
			groupId: uniqueName({ prefix: "isolated-replay" }),
			timings,
		}),
	);
	const admin = kafka.admin();
	const reader = createMeteringConsumer({
		ctx: {
			consumer,
			partitionOffsets: admin,
			stateStore: store,
			positionTracker: createProgressTracker(),
		},
		config: { topic },
	});
	const follower = reader.createReplay({ partition });
	let connected = false;
	let readerStarted = false;
	let joined = false;
	let stopPromise: Promise<void> | undefined;
	function onJoin(): void {
		consumer.pause([{ topic, partitions: [partition] }]);
		joined = true;
	}
	const removeJoin = consumer.on(consumer.events.GROUP_JOIN, onJoin);
	async function readLogRange(
		params: Parameters<PartitionOutcomeFollowerPort["readLogRange"]>[0],
	) {
		await admin.connect();
		connected = true;
		return follower.readLogRange(params);
	}
	function isJoined(): boolean {
		return joined;
	}
	async function startAndCatchUp(
		params: Parameters<PartitionOutcomeFollowerPort["startAndCatchUp"]>[0],
	) {
		readerStarted = true;
		await reader.start();
		await waitUntil({ condition: isJoined, timeoutMs: 10000 });
		await follower.startAndCatchUp(params);
	}
	async function stopReader(): Promise<void> {
		await follower.stop();
		if (readerStarted) await reader.stop();
		removeJoin();
		if (connected) await admin.disconnect();
	}
	function stop(): Promise<void> {
		stopPromise ??= stopReader();
		return stopPromise;
	}
	return {
		readLogRange,
		startAndCatchUp,
		readProgress: follower.readProgress,
		stop,
	};
}
test("prepares without fencing and activates from the committed tail", async function preparesBeforeFencing() {
	const kafka = createKafka({
		clientId: uniqueName({ prefix: "warm-handoff" }),
	});
	const fixture = await createTopic({ kafka });
	const local = createStore({
		topic: fixture.topic,
		initializeCustomer: false,
		initializePartition: false,
	});
	const environment = uniqueName({ prefix: "same-owner" });
	function makeProducer() {
		return createProducerSession({
			ctx: { kafka },
			config: createWorkerProducerConfig({
				deploymentEnvironment: environment,
				topic: fixture.topic,
				partition,
				limits: {
					transactionTimeoutMs: 10_000,
					retryCount: 2,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 1_000,
				},
			}),
		});
	}
	const active = makeProducer();
	const replacement = makeProducer();
	const replay = createReplaySession({
		kafka,
		topic: fixture.topic,
		store: local.store,
	});
	const preparation = createReplaySession({
		kafka,
		topic: fixture.topic,
		store: local.store,
	});
	const bootstrapper = createPartitionBootstrapper({
		stateStore: local.store,
		checkpointSource: checkpointConfiguration.checkpointSource,
		partitionResolver: { partitionForIdentity: () => partition },
		restoreLimits: checkpointConfiguration.checkpointRestoreLimits,
		retryPolicy: checkpointConfiguration.checkpointRetryPolicy,
	});
	const runtime = createPartitionRuntime({
		ctx: {
			stateStore: local.store,
			db: createSyntheticWorkerDb(),
			catalogCache: createTestCatalogCache(),
			producer: createWorkerProducer({
				ctx: { session: replacement },
				config: { topic: fixture.topic, partition },
			}),
			appender: createMutationPublisher({
				ctx: { producer: replacement },
			}),
			follower: replay,
			bootstrapper,
			partitionResolver: { partitionForIdentity: () => partition },
			receiptPolicy: { retentionMs: 86_400_000, now: () => 1_700_000_000_000 },
		},
		config: {
			topic: fixture.topic,
			partition,
			writerLimits: {
				maxBatchSize: 10,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 10,
			},
			recoveryDrainTimeoutMs: 1_000,
		},
	});
	try {
		await active.connect();
		const seed = await active.transaction();
		await seed.send({
			topic: fixture.topic,
			acks: -1,
			messages: [
				{
					partition,
					...serializeMeteringRecord({
						record: createInitializeMutation({
							state: local.state,
							commandId: "init_1",
						}),
					}),
				},
			],
		});
		await seed.commit();
		await runtime.prepare({ follower: preparation });
		expect(runtime.getStatus()).toBe("prepared");
		expect(local.store.readState({ identity: local.state.identity })).toEqual(
			applyMutation({
				state: null,
				mutation: createInitializeMutation({
					state: local.state,
					commandId: "init_1",
				}),
			}),
		);
		const seededState = applyMutation({
			state: null,
			mutation: createInitializeMutation({
				state: local.state,
				commandId: "init_1",
			}),
		});
		const outcome = createMutation({
			state: seededState,
			commandId: "cmd_handoff",
			requestId: "req_handoff",
		});
		await createMutationPublisher({
			ctx: { producer: active },
		}).appendCommitted({
			topic: fixture.topic,
			partition,
			outcomes: [outcome],
		});
		await runtime.activate();
		expect(local.store.readState({ identity: local.state.identity })).toEqual(
			applyMutation({ state: seededState, mutation: outcome }),
		);
		expect(runtime.getStatus()).toBe("ready");
		const command = parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				org: {
					config: {
						reverse_deduction_order: false,
						block_overdue_entitlements: false,
						include_past_due: true,
					},
				},
				commandId: "cmd_handoff",
				requestId: "req_handoff",
				identity: local.state.identity,
				featureId: "messages",
				internalFeatureId: "feat_messages",
				value: 5,
				overageBehavior: "reject",
				properties: null,
				occurredAt: 1_700_000_000_000,
			},
		});
		await expect(
			runtime.process((processor) => processor.track({ command })),
		).resolves.toMatchObject({
			kind: "duplicate",
		});
		await expect(
			createMutationPublisher({
				ctx: { producer: active },
			}).appendCommitted({
				topic: fixture.topic,
				partition,
				outcomes: [outcome],
			}),
		).rejects.toBeInstanceOf(OwnedPartitionProducerFencedError);
	} finally {
		await runtime.stop();
		await preparation.stop();
		await active.disconnect();
		local.cleanup();
		await fixture.cleanup();
	}
});
