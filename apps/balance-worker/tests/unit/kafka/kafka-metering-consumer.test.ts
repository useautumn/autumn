import { describe, expect, test } from "bun:test";
import { executeTrack } from "@autumn/balance-engine";
import {
	createProgressTracker,
	InvalidRecordError,
	type KafkaConsumerClient,
	type ProgressTracker,
	serializeMeteringRecord,
} from "@autumn/kafka";
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
import { createMeteringConsumer } from "../../../src/kafka/meteringConsumer/createMeteringConsumer.js";
import { createMeteringRecordHandler } from "../../../src/kafka/meteringConsumer/createMeteringRecordHandler.js";
import {
	KafkaPartitionInvariantError,
	StateBehindKafkaLogStartError,
} from "../../../src/kafka/meteringConsumer/meteringErrors.js";
import {
	closeStoreFixture,
	createOutcome,
	createState,
	createStoreFixture,
	identity,
	partition,
	serializeKafkaStateInitializedRecord,
	serializeKafkaTrackOutcomeRecord,
	topic,
} from "./kafka-test-fixtures.js";

type KafkaMeteringConsumerPort = KafkaConsumerClient;

type KafkaMeteringConsumerRunConfig = ConsumerRunConfig;

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

function createKafkaMeteringConsumer(params: {
	consumer: KafkaConsumerClient;
	partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
	stateStore: import("../../../src/state/sqliteBalanceStateStore.js").SqliteBalanceStateStore;
	topic: string;
	positionTracker?: ProgressTracker;
	partitionsConsumedConcurrently?: number;
}) {
	const { topic, partitionsConsumedConcurrently, ...ctx } = params;
	return createMeteringConsumer({
		ctx: {
			...ctx,
			positionTracker: ctx.positionTracker ?? createProgressTracker(),
		},
		config: { topic, partitionsConsumedConcurrently },
	});
}

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
			expect(positionTracker.readProgress({ topic, partition })).toEqual({
				consumedNextOffset: 3n,
				highWatermark: 10_000n,
			});
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
			expect(positionTracker.readProgress({ topic, partition })).toEqual({
				consumedNextOffset: 5n,
				highWatermark: 5n,
			});
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

test("withdrawal settles a pending batch without seeking or publishing its stale position", async () => {
	const fixture = createStoreFixture();
	let finishOffsets = (): void => undefined;
	const offsetsGate = new Promise<void>((resolve) => {
		finishOffsets = resolve;
	});
	const port = createFakeKafkaConsumer();
	const tracker = createProgressTracker();
	const consumer = createKafkaMeteringConsumer({
		consumer: port,
		topic,
		stateStore: fixture.store,
		positionTracker: tracker,
		partitionOffsets: {
			fetchTopicOffsets: async () => {
				await offsetsGate;
				return [{ partition, low: "0", high: "2", offset: "2" }];
			},
		},
	});
	try {
		await consumer.start();
		const batch = port.deliver({
			offset: "1",
			...serializeMeteringRecord({
				record: createOutcome({ state: createState() }),
			}),
		});
		let settled = false;
		const withdrawal = consumer.withdrawPartition({ partition }).then(() => {
			settled = true;
		});
		await Bun.sleep(1);
		expect(settled).toBe(false);
		finishOffsets();
		await batch;
		await withdrawal;
		expect(port.seeks).toEqual([]);
		expect(port.commits).toEqual([]);
		expect(tracker.read({ topic, partition })).toBeNull();
		expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
	} finally {
		finishOffsets();
		await consumer.stop();
		closeStoreFixture(fixture);
	}
});

async function replayStopSettlesBatchesBeforeReplacement(): Promise<void> {
	const fixture = createStoreFixture();
	const offsets = Promise.withResolvers<void>();
	const port = createFakeKafkaConsumer();
	const tracker = createProgressTracker();
	function onUnavailable(): void {}
	async function fetchTopicOffsets() {
		await offsets.promise;
		return [{ partition, low: "0", high: "2", offset: "2" }];
	}
	const consumer = createKafkaMeteringConsumer({
		consumer: port,
		partitionOffsets: { fetchTopicOffsets },
		stateStore: fixture.store,
		positionTracker: tracker,
		topic,
	});
	const replay = consumer.createReplay({ partition });
	try {
		const state = createState();
		fixture.store.restoreState({
			topic,
			partition,
			initializationId: "init_1",
			state,
		});
		const record = serializeMeteringRecord({
			record: createOutcome({ state }),
		});
		await consumer.start();
		await replay.startAndCatchUp({
			topic,
			partition,
			targetNextOffset: 0n,
			onUnavailable,
		});
		const delivery = port.deliver({ offset: "1", ...record });
		const stopping = replay.stop();
		expect(await Promise.race([stopping, Promise.resolve("pending")])).toBe(
			"pending",
		);
		offsets.resolve();
		await delivery;
		await stopping;
		expect(port.commits).toEqual([]);
		expect(port.seeks).toEqual([{ topic, partition, offset: "0" }]);
		expect(tracker.read({ topic, partition })).toBe(0n);
		expect(fixture.store.readState({ identity })?.revision).toBe(0);

		const replacement = consumer.createReplay({ partition });
		await replacement.startAndCatchUp({
			topic,
			partition,
			targetNextOffset: 0n,
			onUnavailable,
		});
		await port.deliver({ offset: "0", ...record });
		expect(fixture.store.readState({ identity })?.revision).toBe(1);
		expect(tracker.read({ topic, partition })).toBe(1n);
		await replacement.stop();
	} finally {
		offsets.resolve();
		await replay.stop();
		await consumer.stop();
		closeStoreFixture(fixture);
	}
}

test(
	"replay stop settles stale batches before a replacement resumes consumption",
	replayStopSettlesBatchesBeforeReplacement,
);

describe("recordApplication", function recordApplicationTests() {
	function preservesSynchronousReadsAndApplications(): void {
		const fixture = createStoreFixture({ nextOffset: 3n });
		async function fetchTopicOffsets(): Promise<never> {
			throw new Error("No broker read expected");
		}
		const handler = createMeteringRecordHandler({
			ctx: {
				stateStore: fixture.store,
				partitionOffsets: { fetchTopicOffsets },
			},
		});
		try {
			expect(
				handler.readResumeOffset({ topic, partition, firstOffset: 3n }),
			).toBeNull();
			expect(
				handler.readResumeOffset({ topic, partition, firstOffset: 1n }),
			).toBe(3n);
			expect(
				handler.readResumeOffset({ topic, partition: 1, firstOffset: 0n }),
			).toBeNull();
			const state = createState();
			expect(
				handler.applyRecord({
					position: { topic, partition, offset: 3n },
					record: {
						schemaVersion: 1,
						type: "state_initialized",
						initializationId: "initial",
						initializedAt: 1_700_000_000_000,
						state,
					},
				}),
			).toBeUndefined();
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(4n);
			const record = createOutcome({ state });
			expect(
				handler.applyRecord({
					position: { topic, partition, offset: 4n },
					record,
				}),
			).toBeUndefined();
			expect(
				fixture.store.readState({ identity: state.identity })?.revision,
			).toBe(1);
			expect(
				handler.applyRecord({
					position: { topic, partition, offset: 4n },
					record,
				}),
			).toEqual({ nextOffset: 5n });
		} finally {
			closeStoreFixture(fixture);
		}
	}

	async function readsRetentionOnlyWhenRewinding(): Promise<void> {
		const fixture = createStoreFixture({ nextOffset: 3n });
		const gate = Promise.withResolvers<void>();
		let low = "1";
		let brokerReads = 0;
		async function fetchTopicOffsets() {
			brokerReads++;
			await gate.promise;
			return [{ partition, offset: "8", high: "8", low }];
		}
		const handler = createMeteringRecordHandler({
			ctx: {
				stateStore: fixture.store,
				partitionOffsets: { fetchTopicOffsets },
			},
		});
		try {
			const resume = handler.readResumeOffset({
				topic,
				partition,
				firstOffset: 5n,
			});
			expect(resume).toBeInstanceOf(Promise);
			expect(brokerReads).toBe(1);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
			gate.resolve();
			await expect(Promise.resolve(resume)).resolves.toBe(3n);
			low = "4";
			const lost = handler.readResumeOffset({
				topic,
				partition,
				firstOffset: 5n,
			});
			await expect(Promise.resolve(lost)).rejects.toBeInstanceOf(
				StateBehindKafkaLogStartError,
			);
			await expect(Promise.resolve(lost)).rejects.toMatchObject({
				retriable: false,
				storedNextOffset: 3n,
				logStartOffset: 4n,
			});
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
		} finally {
			gate.resolve();
			closeStoreFixture(fixture);
		}
	}

	function mapsOnlyPartitionInvariantErrors(): void {
		const fixture = createStoreFixture();
		async function fetchTopicOffsets() {
			return [];
		}
		const handler = createMeteringRecordHandler({
			ctx: {
				stateStore: fixture.store,
				partitionOffsets: { fetchTopicOffsets },
			},
		});
		const invariant = new InvalidRecordError();
		const ordinary = new Error("store disconnected");
		function throwInvariant(): never {
			if (!handler.onRecordError) throw new Error("Expected an error boundary");
			return handler.onRecordError({
				topic,
				partition,
				offset: "7",
				cause: invariant,
			});
		}
		function readOrdinaryFailure(): unknown {
			try {
				if (!handler.onRecordError)
					throw new Error("Expected an error boundary");
				handler.onRecordError({
					topic,
					partition,
					offset: "7",
					cause: ordinary,
				});
			} catch (cause) {
				return cause;
			}
		}
		try {
			expect(throwInvariant).toThrow(KafkaPartitionInvariantError);
			try {
				throwInvariant();
			} catch (cause) {
				expect(cause).toMatchObject({
					topic,
					partition,
					offset: "7",
					cause: invariant,
					retriable: false,
				});
			}
			expect(readOrdinaryFailure()).toBe(ordinary);
		} finally {
			closeStoreFixture(fixture);
		}
	}

	test(
		"metering handler preserves synchronous resume reads, applies, and writer-race offsets",
		preservesSynchronousReadsAndApplications,
	);

	test(
		"metering handler awaits retention only when rewinding behind the first fetched record",
		readsRetentionOnlyWhenRewinding,
	);

	test(
		"metering handler wraps known partition invariants and preserves other errors",
		mapsOnlyPartitionInvariantErrors,
	);
});

describe("consumerLifecycle", function consumerLifecycleTests() {
	function createLifecycleFixture({
		startFailure,
		stopFailure,
		disconnectFailure,
	}: {
		startFailure?: Error;
		stopFailure?: Error;
		disconnectFailure?: Error;
	} = {}) {
		const fixture = createStoreFixture();
		const events: string[] = [];
		const listeners = new Set<unknown>();
		function on(_event: string, listener: unknown) {
			listeners.add(listener);
			function unsubscribe(): void {
				listeners.delete(listener);
			}
			return unsubscribe;
		}
		async function connect(): Promise<void> {
			events.push("connect");
		}
		async function subscribe(): Promise<void> {
			events.push("subscribe");
		}
		async function run(): Promise<void> {
			events.push("run");
			if (startFailure) throw startFailure;
		}
		async function stop(): Promise<void> {
			events.push("stop");
			if (stopFailure) throw stopFailure;
		}
		async function disconnect(): Promise<void> {
			events.push("disconnect");
			if (disconnectFailure) throw disconnectFailure;
		}
		async function commitOffsets(): Promise<void> {}
		function seek(): void {}
		function pause(): void {}
		function resume(): void {}
		async function fetchTopicOffsets() {
			return [];
		}
		function close(): void {
			closeStoreFixture(fixture);
		}
		const kafka: KafkaConsumerClient = {
			connect,
			subscribe,
			run,
			stop,
			disconnect,
			commitOffsets,
			seek,
			pause,
			resume,
			events: {
				GROUP_JOIN: "consumer.group_join",
				END_BATCH_PROCESS: "consumer.end_batch_process",
			} as KafkaConsumerClient["events"],
			on: on as KafkaConsumerClient["on"],
		};
		const consumer = createMeteringConsumer({
			ctx: {
				consumer: kafka,
				partitionOffsets: { fetchTopicOffsets },
				stateStore: fixture.store,
				positionTracker: createProgressTracker(),
			},
			config: { topic },
		});
		return { consumer, events, listeners, close };
	}

	async function startupFailureCleansUp(): Promise<void> {
		const startFailure = new Error("run failed");
		const fixture = createLifecycleFixture({
			startFailure,
			disconnectFailure: new Error("disconnect failed"),
		});
		try {
			await expect(fixture.consumer.start()).rejects.toBe(startFailure);
			expect(fixture.listeners.size).toBe(0);
			expect(fixture.events).toEqual([
				"connect",
				"subscribe",
				"run",
				"disconnect",
			]);
		} finally {
			fixture.close();
		}
	}

	async function stopFailureStillDisconnects(): Promise<void> {
		const stopFailure = new Error("stop failed");
		const fixture = createLifecycleFixture({ stopFailure });
		try {
			await fixture.consumer.start();
			await expect(fixture.consumer.stop()).rejects.toBe(stopFailure);
			expect(fixture.listeners.size).toBe(0);
			expect(fixture.events).toEqual([
				"connect",
				"subscribe",
				"run",
				"stop",
				"disconnect",
			]);
			await fixture.consumer.stop();
			expect(fixture.events.length).toBe(5);
		} finally {
			fixture.close();
		}
	}

	test(
		"consumer startup cleanup preserves the startup error and removes listeners",
		startupFailureCleansUp,
	);

	test(
		"consumer shutdown disconnects and removes listeners even when stop fails",
		stopFailureStillDisconnects,
	);
});
