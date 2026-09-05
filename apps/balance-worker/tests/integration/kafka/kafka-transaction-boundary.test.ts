import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { createKafkaClient as balanceWorkerKafkaConfigOf } from "@autumn/kafka";
import { Kafka, logLevel, type RecordMetadata } from "kafkajs";
import type { KafkaBalanceWorkerTimings } from "../../../src/init/types/partitionRuntimeFactory.js";
import { createWorkerConsumerConfig as balanceWorkerConsumerConfigOf } from "../../../src/init/workerConfig.js";
import { OwnedPartitionProducerFencedError } from "../../../src/runtime/runtimeErrors.js";
import type { PartitionOutcomeFollowerPort } from "../../../src/runtime/types/partitionRuntime.js";
import { openSqliteBalanceStateStore } from "../../../src/state/sqliteBalanceStateStore.js";
import {
	createKafkaCommittedTrackOutcomeAppender,
	createKafkaOwnedPartitionGroup,
	createKafkaOwnedPartitionProducer,
	createKafkaOwnedPartitionRuntimeFactory,
	createOutcome,
	createOwnedPartitionRuntime,
	createState,
	serializeKafkaStateInitializedRecord,
	serializeKafkaTrackOutcomeRecord,
} from "../../unit/kafka/kafka-test-fixtures.js";

const brokers = (process.env.KAFKA_BROKERS ?? "127.0.0.1:19092").split(",");
const partition = 0;
const timings = {
	fetchMaxWaitTimeMs: 250,
	heartbeatIntervalMs: 3_000,
	recoveryDrainTimeoutMs: 5_000,
	rebalanceTimeoutMs: 60_000,
	sessionTimeoutMs: 30_000,
} satisfies KafkaBalanceWorkerTimings;

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
}: {
	topic: string;
	initializeCustomer?: boolean;
}) => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-kafka-fence-"));
	const store = openSqliteBalanceStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	const state = createCustomerMeteringState({
		identity: { orgId: "org_1", env: "sandbox", customerId: "cus_1" },
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [
					{ id: "messages_monthly", balance: 10, usage: 0 },
				],
			},
		},
	});
	store.initializePartition({ topic, partition, nextOffset: 0n });
	if (initializeCustomer) {
		store.restoreState({
			topic,
			partition,
			initializationId: "init_1",
			state,
		});
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
	startAndCatchUp: async () => undefined,
	stop: async () => undefined,
});

describe("Kafka transaction boundary", () => {
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
		const createRuntime = createKafkaOwnedPartitionRuntimeFactory({
			kafka,
			deploymentEnvironment: uniqueName({ prefix: "state-seed-owner" }),
			stateStore: storeFixture.store,
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
		const errors: unknown[] = [];
		const group = createKafkaOwnedPartitionGroup({
			consumer,
			partitionOffsets,
			topic: topicFixture.topic,
			stateStore: storeFixture.store,
			partitionsConsumedConcurrently: 1,
			createRuntime: (params) => {
				const createdRuntime = createRuntime(params);
				runtime = createdRuntime;
				return createdRuntime;
			},
			onError: ({ cause }) => errors.push(cause),
		});

		try {
			await seedProducer.connect();
			const outcome = createOutcome({ state: storeFixture.state });
			const transaction = await seedProducer.transaction();
			await transaction.send({
				topic: topicFixture.topic,
				acks: -1,
				messages: [
					{
						...serializeKafkaStateInitializedRecord({
							initialization: {
								schemaVersion: 1,
								type: "state_initialized",
								initializationId: "init_1",
								initializedAt: 1_700_000_000_000,
								state: storeFixture.state,
							},
						}),
						partition,
					},
					{
						...serializeKafkaTrackOutcomeRecord({ outcome }),
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
						customerEntitlements: [{ balance: 5, usage: 5 }],
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
			const outcome = createOutcome({ state });
			const serialized = serializeKafkaTrackOutcomeRecord({ outcome });
			const abortedTransaction = await producer.transaction();
			const abortedMetadata = await abortedTransaction.send({
				topic: topicFixture.topic,
				acks: -1,
				messages: [{ ...serialized, partition }],
			});
			await abortedTransaction.abort();
			const abortedOffset = baseOffsetFrom({ metadata: abortedMetadata });

			const appender = createKafkaCommittedTrackOutcomeAppender({ producer });
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
		const createRuntime = createKafkaOwnedPartitionRuntimeFactory({
			kafka,
			deploymentEnvironment: uniqueName({ prefix: "catch-up-owner" }),
			stateStore: storeFixture.store,
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
		const errors: unknown[] = [];
		const group = createKafkaOwnedPartitionGroup({
			consumer,
			partitionOffsets,
			topic: topicFixture.topic,
			stateStore: storeFixture.store,
			partitionsConsumedConcurrently: 2,
			createRuntime: (params) => {
				const createdRuntime = createRuntime(params);
				runtime = createdRuntime;
				return createdRuntime;
			},
			onError: ({ cause }) => errors.push(cause),
		});
		try {
			await seedProducer.connect();
			const state = createState();
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state }),
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
				partitionResolver: { partitionForIdentity: () => partition },
				writerLimits: {
					maxBatchSize: 100,
					maxPendingCommands: 1_000,
					maxPendingCommandsPerCustomer: 100,
				},
				trackReceiptPolicy: {
					retentionMs: 86_400_000,
					now: Date.now,
				},
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
					commandId: "cmd_fenced_owner",
					requestId: "req_fenced_owner",
					identity: firstStore.state.identity,
					entityId: null,
					featureId: "messages",
					value: 5,
					overageBehavior: "reject",
					properties: null,
					occurredAt: 1_700_000_000_000,
				},
			});

			await expect(
				waitWithin({
					promise: firstRuntime.submitTrack({ command }),
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
