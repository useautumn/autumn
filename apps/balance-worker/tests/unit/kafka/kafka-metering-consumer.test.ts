import { describe, expect, test } from "bun:test";
import { executeTrack } from "@autumn/balance-engine";
import type { KafkaConsumerClient } from "@autumn/kafka";
import { createProgressTracker, serializeMeteringRecord } from "@autumn/kafka";
import type {
	Admin,
	Batch,
	ConsumerEndBatchProcessEvent,
	ConsumerRunConfig,
	EachBatchHandler,
	EachMessageHandler,
	KafkaMessage,
	OffsetsByTopicPartition,
} from "kafkajs";
import {
	createKafkaMeteringConsumer as createKafkaMeteringConsumerWithoutDefaults,
	type KafkaMeteringConsumerPort,
	type KafkaMeteringConsumerRunConfig,
	type KafkaPartitionOffsetsPort,
	StateBehindKafkaLogStartError,
} from "../../../src/kafka/kafkaMeteringConsumer.js";
import {
	serializeKafkaStateInitializedRecord,
	serializeKafkaTrackOutcomeRecord,
} from "../../../src/kafka/kafkaMeteringRecord.js";
import { KafkaPartitionPositionTracker } from "../../../src/kafka/kafkaPartitionPositionTracker.js";
import {
	closeStoreFixture,
	createOutcome,
	createState,
	createStoreFixture,
	identity,
	partition,
	topic,
} from "./kafka-test-fixtures.js";

type Commit = {
	topic: string;
	partition: number;
	offset: string;
};

type FakeKafkaConsumer = KafkaMeteringConsumerPort & {
	commits: Commit[][];
	emitGroupJoin: () => void;
	emitEndBatchProcess(params: { batchSize: number; lastOffset: string }): void;
	lifecycle: string[];
	runConfig: KafkaMeteringConsumerRunConfig | null;
	seeks: Commit[];
	deliverBatch: (params: {
		lastOffset?: string;
		uncommittedPartition?: number | string;
		records: Array<{
			offset: string;
			key: Buffer | null;
			value: Buffer | null;
		}>;
	}) => Promise<void>;
	deliver: (params: {
		offset: string;
		key: Buffer | null;
		value: Buffer | null;
	}) => Promise<void>;
	failNextCommit: (error: Error) => void;
};

const createFakeKafkaPartitionOffsets = ({
	low = "0",
	high = "10000",
}: {
	low?: string;
	high?: string;
} = {}): Pick<Admin, "fetchTopicOffsets"> => ({
	fetchTopicOffsets: async () => [
		{
			partition,
			offset: high,
			low,
			high,
		},
	],
});

const createKafkaMeteringConsumer = ({
	positionTracker = new KafkaPartitionPositionTracker(),
	...params
}: Omit<
	Parameters<typeof createKafkaMeteringConsumerWithoutDefaults>[0],
	"positionTracker"
> & {
	positionTracker?: KafkaPartitionPositionTracker;
}) =>
	createKafkaMeteringConsumerWithoutDefaults({
		...params,
		positionTracker,
	});

const createFakeKafkaConsumer = ({
	onCommit,
}: {
	onCommit?: () => void;
} = {}): FakeKafkaConsumer => {
	let eachBatch: EachBatchHandler | null = null;
	let eachMessage: EachMessageHandler | null = null;
	let groupJoinListener: (() => void) | null = null;
	let endBatchProcessListener:
		| ((event: ConsumerEndBatchProcessEvent) => void)
		| null = null;
	let nextCommitError: Error | null = null;
	const commits: Commit[][] = [];
	const seeks: Commit[] = [];
	const lifecycle: string[] = [];
	const commitOffsets = async (offsets: Commit[]): Promise<void> => {
		lifecycle.push("commit");
		onCommit?.();
		if (nextCommitError) {
			const error = nextCommitError;
			nextCommitError = null;
			throw error;
		}
		commits.push(offsets);
	};
	const toKafkaMessage = ({
		offset,
		key,
		value,
	}: {
		offset: string;
		key: Buffer | null;
		value: Buffer | null;
	}): KafkaMessage => ({
		offset,
		key,
		value,
		timestamp: "0",
		attributes: 0,
		headers: {},
	});

	return {
		commits,
		seeks,
		lifecycle,
		runConfig: null,
		events: {
			GROUP_JOIN: "consumer.group_join",
			END_BATCH_PROCESS: "consumer.end_batch_process",
		} as KafkaMeteringConsumerPort["events"],
		on: ((eventName: string, listener: never) => {
			if (eventName === "consumer.group_join") groupJoinListener = listener;
			if (eventName === "consumer.end_batch_process")
				endBatchProcessListener = listener;
			return () => {
				if (groupJoinListener === listener) groupJoinListener = null;
				if (endBatchProcessListener === listener)
					endBatchProcessListener = null;
			};
		}) as KafkaMeteringConsumerPort["on"],
		connect: async () => {
			lifecycle.push("connect");
		},
		subscribe: async () => {
			lifecycle.push("subscribe");
		},
		run: async function (config) {
			lifecycle.push("run");
			if (!config?.eachBatch && !config?.eachMessage) {
				throw new Error("Expected a Kafka record handler");
			}
			const runConfig = config as KafkaMeteringConsumerRunConfig;
			this.runConfig = runConfig;
			eachBatch = config.eachBatch ?? null;
			eachMessage = config.eachMessage ?? null;
		},
		commitOffsets,
		pause: () => undefined,
		resume: () => undefined,
		seek: (position) => {
			lifecycle.push("seek");
			seeks.push(position);
		},
		stop: async () => {
			lifecycle.push("stop");
		},
		disconnect: async () => {
			lifecycle.push("disconnect");
		},
		deliverBatch: async ({ lastOffset, records, uncommittedPartition }) => {
			if (eachBatch) {
				let lastResolvedOffset: string | null = null;
				const messages = records.map(toKafkaMessage);
				const uncommittedOffsets = (): OffsetsByTopicPartition =>
					lastResolvedOffset === null
						? { topics: [] }
						: {
								topics: [
									{
										topic,
										partitions: [
											{
												partition: (uncommittedPartition ??
													partition) as number,
												offset: (BigInt(lastResolvedOffset) + 1n).toString(),
											},
										],
									},
								],
							};
				const batch: Batch = {
					topic,
					partition,
					highWatermark: "10000",
					messages,
					isEmpty: () => messages.length === 0,
					firstOffset: () => messages[0]?.offset ?? null,
					lastOffset: () => lastOffset ?? messages.at(-1)?.offset ?? "0",
					offsetLag: () => "0",
					offsetLagLow: () => "0",
				};
				await eachBatch({
					batch,
					resolveOffset: (offset) => {
						lastResolvedOffset = offset;
					},
					heartbeat: async () => undefined,
					pause: () => () => undefined,
					commitOffsetsIfNecessary: async (offsets) => {
						const offsetsToCommit = offsets ?? uncommittedOffsets();
						await commitOffsets(
							offsetsToCommit.topics.flatMap(
								({ topic: commitTopic, partitions }) =>
									partitions.map(({ partition: commitPartition, offset }) => ({
										topic: commitTopic,
										partition: commitPartition,
										offset,
									})),
							),
						);
					},
					uncommittedOffsets,
					isRunning: () => true,
					isStale: () => false,
				});
				return;
			}

			if (!eachMessage) throw new Error("Consumer has not started");
			for (const record of records) {
				await eachMessage({
					topic,
					partition,
					message: toKafkaMessage(record),
					heartbeat: async () => undefined,
					pause: () => () => undefined,
				});
			}
		},
		deliver: async function ({ offset, key, value }) {
			await this.deliverBatch({ records: [{ offset, key, value }] });
		},
		failNextCommit: (error) => {
			nextCommitError = error;
		},
		emitGroupJoin: () => {
			groupJoinListener?.();
		},
		emitEndBatchProcess: ({ batchSize, lastOffset }) => {
			endBatchProcessListener?.({
				id: "event_1",
				type: "consumer.end_batch_process",
				timestamp: Date.now(),
				payload: {
					topic,
					partition,
					highWatermark: (BigInt(lastOffset) + 1n).toString(),
					offsetLag: "0",
					offsetLagLow: "0",
					batchSize,
					firstOffset: lastOffset,
					lastOffset,
					duration: 1,
				},
			});
		},
	};
};

describe("Kafka metering consumer", () => {
	test("folds a new customer's initialization before its first track", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			const outcome = createOutcome({ state });
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			await consumerPort.deliverBatch({
				records: [
					{
						offset: "0",
						...serializeKafkaStateInitializedRecord({
							initialization: {
								schemaVersion: 1,
								type: "state_initialized",
								initializationId: "init_1",
								initializedAt: 1_700_000_000_000,
								state,
							},
						}),
					},
					{
						offset: "1",
						...serializeKafkaTrackOutcomeRecord({ outcome }),
					},
				],
			});

			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 5, usage: 5 }],
					},
				},
			});
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("publishes consumed position only after folding and committing a visible record", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state }),
			});
			const positionTracker = createProgressTracker();
			const consumerPort = createFakeKafkaConsumer({
				onCommit: () => {
					expect(positionTracker.read({ topic, partition })).toBeNull();
				},
			});
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
				positionTracker,
			});

			await consumer.start();
			await consumerPort.deliver({ offset: "0", ...serialized });

			expect(positionTracker.read({ topic, partition })).toBe(1n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("publishes the fetched position after folding every visible record in a batch", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			const outcome = createOutcome({ state });
			const positionTracker = new KafkaPartitionPositionTracker();
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
				positionTracker,
			});

			await consumer.start();
			await consumerPort.deliverBatch({
				lastOffset: "2",
				records: [
					{
						offset: "0",
						...serializeKafkaStateInitializedRecord({
							initialization: {
								schemaVersion: 1,
								type: "state_initialized",
								initializationId: "init_1",
								initializedAt: 1_700_000_000_000,
								state,
							},
						}),
					},
					{
						offset: "1",
						...serializeKafkaTrackOutcomeRecord({ outcome }),
					},
				],
			});

			expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
			expect(positionTracker.read({ topic, partition })).toBe(3n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("normalizes KafkaJS string partition ids before committing", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			await consumerPort.deliverBatch({
				uncommittedPartition: "0",
				records: [
					{
						offset: "0",
						...serializeKafkaTrackOutcomeRecord({
							outcome: createOutcome({ state }),
						}),
					},
				],
			});

			expect(consumerPort.commits).toEqual([
				[{ topic, partition, offset: "1" }],
			]);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("advances consumed position for Kafka batches containing only filtered records", async () => {
		const fixture = createStoreFixture();
		try {
			const positionTracker = createProgressTracker();
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
				positionTracker,
			});

			await consumer.start();
			consumerPort.emitEndBatchProcess({ batchSize: 0, lastOffset: "4" });

			expect(positionTracker.read({ topic, partition })).toBe(5n);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);

			consumerPort.emitEndBatchProcess({ batchSize: 1, lastOffset: "8" });
			expect(positionTracker.read({ topic, partition })).toBe(5n);
		} finally {
			closeStoreFixture(fixture);
		}
	});
	test("applies SQLite state before committing the Kafka offset", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state }),
			});
			const consumerPort = createFakeKafkaConsumer({
				onCommit: () => {
					expect(fixture.store.readState({ identity })?.revision).toBe(1);
					expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
				},
			});
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
				partitionsConsumedConcurrently: 2,
			});

			await consumer.start();
			await consumerPort.deliver({ offset: "0", ...serialized });

			expect(consumerPort.runConfig).toMatchObject({
				autoCommit: false,
				partitionsConsumedConcurrently: 2,
			});
			expect(consumerPort.commits).toEqual([
				[{ topic, partition, offset: "1" }],
			]);
			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 5, usage: 5 }],
					},
				},
			});
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("commits once after folding every record in a fetched batch", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state: initialState,
			});
			const firstOutcome = createOutcome({ state: initialState });
			const firstExecution = executeTrack({
				state: initialState,
				outcome: firstOutcome,
				existingReceipt: null,
			});
			if (firstExecution.kind !== "applied") {
				throw new Error("Expected first outcome to apply");
			}
			const secondOutcome = createOutcome({
				state: firstExecution.state,
				commandId: "cmd_2",
				requestId: "req_2",
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			await consumerPort.deliverBatch({
				records: [
					{
						offset: "0",
						...serializeMeteringRecord({ record: firstOutcome }),
					},
					{
						offset: "1",
						...serializeMeteringRecord({ record: secondOutcome }),
					},
				],
			});

			expect(consumerPort.runConfig).toMatchObject({
				autoCommit: false,
				eachBatchAutoResolve: false,
			});
			expect(consumerPort.commits).toEqual([
				[{ topic, partition, offset: "2" }],
			]);
			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 2,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 0, usage: 10 }],
					},
				},
			});
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("repairs a lagging group offset after a commit failure", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state: initialState,
			});
			const firstOutcome = createOutcome({ state: initialState });
			const firstExecution = executeTrack({
				state: initialState,
				outcome: firstOutcome,
				existingReceipt: null,
			});
			if (firstExecution.kind !== "applied") {
				throw new Error("Expected first outcome to apply");
			}
			const secondOutcome = createOutcome({
				state: firstExecution.state,
				commandId: "cmd_2",
				requestId: "req_2",
			});
			const records = [
				{
					offset: "0",
					...serializeMeteringRecord({ record: firstOutcome }),
				},
				{
					offset: "1",
					...serializeMeteringRecord({ record: secondOutcome }),
				},
			];
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});
			await consumer.start();

			consumerPort.failNextCommit(new Error("rebalance during commit"));
			await expect(consumerPort.deliverBatch({ records })).rejects.toThrow(
				"rebalance during commit",
			);
			expect(fixture.store.readState({ identity })?.revision).toBe(2);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);

			await consumerPort.deliverBatch({ records });

			expect(consumerPort.commits).toEqual([
				[{ topic, partition, offset: "2" }],
			]);
			expect(consumerPort.seeks).toEqual([{ topic, partition, offset: "2" }]);
			expect(fixture.store.readState({ identity })?.revision).toBe(2);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("does not seek when the writer already applied exactly this record", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state: initialState,
			});
			const firstOutcome = createOutcome({ state: initialState });
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});
			await consumer.start();
			await consumerPort.deliver({
				offset: "0",
				...serializeMeteringRecord({ record: firstOutcome }),
			});

			const currentState = fixture.store.readState({ identity });
			if (!currentState) throw new Error("Expected current state");
			const secondOutcome = createOutcome({
				state: currentState,
				commandId: "cmd_2",
				requestId: "req_2",
			});
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 1n },
				outcome: secondOutcome,
			});

			await consumerPort.deliver({
				offset: "1",
				...serializeMeteringRecord({ record: secondOutcome }),
			});

			expect(consumerPort.seeks).toEqual([]);
			expect(consumerPort.commits.at(-1)).toEqual([
				{ topic, partition, offset: "2" },
			]);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("commits across valid gaps in delivered Kafka offsets", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state }),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			await consumerPort.deliver({ offset: "3", ...serialized });

			expect(consumerPort.commits).toEqual([
				[{ topic, partition, offset: "0" }],
			]);
			expect(consumerPort.seeks).toEqual([{ topic, partition, offset: "0" }]);
			expect(fixture.store.readState({ identity })?.revision).toBe(0);

			await consumerPort.deliver({ offset: "3", ...serialized });

			expect(consumerPort.commits).toEqual([
				[{ topic, partition, offset: "0" }],
				[{ topic, partition, offset: "4" }],
			]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(4n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("refuses to fold when SQLite progress is behind the Kafka log start", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state: initialState,
			});
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 0n },
				outcome: createOutcome({ state: initialState }),
			});
			const restoredState = fixture.store.readState({ identity });
			if (!restoredState) throw new Error("Expected restored state");
			const serialized = serializeMeteringRecord({
				record: createOutcome({
					state: restoredState,
					commandId: "cmd_2",
					requestId: "req_2",
				}),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets({
					low: "5000",
					high: "5001",
				}),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			const delivery = consumerPort.deliver({ offset: "5000", ...serialized });
			await expect(delivery).rejects.toBeInstanceOf(
				StateBehindKafkaLogStartError,
			);
			await expect(delivery).rejects.toMatchObject({ retriable: false });

			expect(consumerPort.commits).toEqual([]);
			expect(consumerPort.seeks).toEqual([]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
			expect(fixture.store.readState({ identity })?.revision).toBe(1);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("retries reconciliation when its offset commit fails", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state }),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});
			await consumer.start();

			consumerPort.failNextCommit(new Error("reconciliation commit failed"));
			await expect(
				consumerPort.deliver({ offset: "3", ...serialized }),
			).rejects.toThrow("reconciliation commit failed");
			expect(consumerPort.commits).toEqual([]);
			expect(consumerPort.seeks).toEqual([]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);

			await consumerPort.deliver({ offset: "3", ...serialized });

			expect(consumerPort.commits).toEqual([
				[{ topic, partition, offset: "0" }],
			]);
			expect(consumerPort.seeks).toEqual([{ topic, partition, offset: "0" }]);
			expect(fixture.store.readState({ identity })?.revision).toBe(0);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("rewinds a new assignment to SQLite progress before folding", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state: initialState,
			});
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 0n },
				outcome: createOutcome({ state: initialState }),
			});
			const restoredState = fixture.store.readState({ identity });
			if (!restoredState) throw new Error("Expected restored state");
			const serialized = serializeMeteringRecord({
				record: createOutcome({
					state: restoredState,
					commandId: "cmd_2",
					requestId: "req_2",
				}),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			await consumerPort.deliver({ offset: "3", ...serialized });

			expect(consumerPort.commits).toEqual([
				[{ topic, partition, offset: "1" }],
			]);
			expect(consumerPort.seeks).toEqual([{ topic, partition, offset: "1" }]);
			expect(fixture.store.readState({ identity })?.revision).toBe(1);

			await consumerPort.deliver({ offset: "1", ...serialized });

			expect(consumerPort.commits.at(-1)).toEqual([
				{ topic, partition, offset: "2" },
			]);
			expect(fixture.store.readState({ identity })?.revision).toBe(2);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("reconciles a partition again after joining a new group generation", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state: initialState,
			});
			const firstSerialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state: initialState }),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});
			await consumer.start();
			await consumerPort.deliver({ offset: "0", ...firstSerialized });

			const restoredState = fixture.store.readState({ identity });
			if (!restoredState) throw new Error("Expected restored state");
			const secondSerialized = serializeMeteringRecord({
				record: createOutcome({
					state: restoredState,
					commandId: "cmd_2",
					requestId: "req_2",
				}),
			});
			consumerPort.emitGroupJoin();
			await consumerPort.deliver({ offset: "3", ...secondSerialized });

			expect(consumerPort.commits.at(-1)).toEqual([
				{ topic, partition, offset: "1" },
			]);
			expect(consumerPort.seeks).toEqual([{ topic, partition, offset: "1" }]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
			expect(fixture.store.readState({ identity })?.revision).toBe(1);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("does not commit or advance a malformed record", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			await expect(
				consumerPort.deliver({
					offset: "0",
					key: Buffer.from("invalid", "utf8"),
					value: Buffer.from("not-json", "utf8"),
				}),
			).rejects.toMatchObject({
				name: "KafkaPartitionInvariantError",
				retriable: false,
			});

			expect(consumerPort.commits).toEqual([]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
			expect(fixture.store.readState({ identity })?.revision).toBe(0);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("marks an invalid record offset as non-retryable", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state,
			});
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state }),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			await expect(
				consumerPort.deliver({ offset: "-1", ...serialized }),
			).rejects.toMatchObject({ retriable: false });
			expect(consumerPort.commits).toEqual([]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("marks an out-of-order outcome as a non-retryable invariant failure", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			fixture.store.restoreState({
				topic,
				partition,
				initializationId: "init_1",
				state: initialState,
			});
			const firstOutcome = createOutcome({ state: initialState });
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 0n },
				outcome: firstOutcome,
			});
			const staleOutcome = createOutcome({
				state: initialState,
				commandId: "cmd_2",
				requestId: "req_2",
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			await expect(
				consumerPort.deliver({
					offset: "1",
					...serializeMeteringRecord({ record: staleOutcome }),
				}),
			).rejects.toMatchObject({
				name: "KafkaPartitionInvariantError",
				retriable: false,
			});
			expect(consumerPort.commits).toEqual([]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("stops consumption before disconnecting", async () => {
		const fixture = createStoreFixture();
		try {
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			await consumer.stop();

			expect(consumerPort.lifecycle).toEqual([
				"connect",
				"subscribe",
				"run",
				"stop",
				"disconnect",
			]);
		} finally {
			closeStoreFixture(fixture);
		}
	});
});
