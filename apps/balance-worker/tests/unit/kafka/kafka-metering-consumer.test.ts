import { describe, expect, test } from "bun:test";
import { applyMutation } from "@autumn/balance-engine";
import {
	createProgressTracker,
	InvalidRecordError,
	type KafkaConsumerClient,
	type ProgressTracker,
	serializeMeteringRecord,
	type TopicRecordResult,
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
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import {
	applyDurableMutation,
	createInitializeMutation,
	restoreSubjectStates,
} from "../../fixtures/mutations.js";
import {
	closeStoreFixture,
	createMutation,
	createState,
	createStoreFixture,
	identity,
	partition,
	serializeKafkaMutationRecord,
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
	partitionOffsets: Pick<Admin, "fetchTopicOffsets"> &
		Partial<Pick<Admin, "fetchTopicOffsetsByTimestamp">>;
	stateStore: import("../../../src/state/types/stateStore.js").StateStore;
	topic: string;
	positionTracker?: ProgressTracker;
	partitionsConsumedConcurrently?: number;
}) {
	const { topic, partitionsConsumedConcurrently, ...ctx } = params;
	return createMeteringConsumer({
		ctx: {
			...ctx,
			positionTracker: ctx.positionTracker ?? createProgressTracker(),
			replayWindow: { windowMs: 600_000, lookupTimeoutMs: 50, now: () => 0 },
		},
		config: { topic, partitionsConsumedConcurrently },
	});
}

/** A replay following the partition from its bookmark, as the runtime holds it during catch-up. */
async function followPartition({
	consumer,
	targetNextOffset,
}: {
	consumer: ReturnType<typeof createKafkaMeteringConsumer>;
	targetNextOffset: bigint;
}) {
	const unavailable: unknown[] = [];
	const replay = consumer.createReplay({
		partition,
		recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
	});
	await replay.startAndCatchUp({
		topic,
		partition,
		targetNextOffset,
		onUnavailable: ({ cause }) => {
			unavailable.push(cause);
		},
	});
	return { replay, unavailable };
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
		pause: () => {
			lifecycle.push("pause");
		},
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
			const initialization = createInitializeMutation({
				state,
				commandId: "init_1",
			});
			const outcome = createMutation({
				state: applyMutation({ state: null, mutation: initialization }),
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
						...serializeKafkaMutationRecord({
							mutation: initialization,
						}),
					},
					{
						offset: "1",
						...serializeKafkaMutationRecord({ mutation: outcome }),
					},
				],
			});

			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 2,
				customerEntitlements: expect.arrayContaining([
					expect.objectContaining({ id: "messages_monthly", balance: 5 }),
				]),
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
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [state],
			});
			const serialized = serializeKafkaMutationRecord({
				mutation: createMutation({ state }),
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
			const initialization = createInitializeMutation({
				state,
				commandId: "init_1",
			});
			const outcome = createMutation({
				state: applyMutation({ state: null, mutation: initialization }),
			});
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
						...serializeKafkaMutationRecord({
							mutation: initialization,
						}),
					},
					{
						offset: "1",
						...serializeKafkaMutationRecord({ mutation: outcome }),
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
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [state],
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
						...serializeKafkaMutationRecord({
							mutation: createMutation({ state }),
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
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [state],
			});
			const serialized = serializeKafkaMutationRecord({
				mutation: createMutation({ state }),
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
				customerEntitlements: expect.arrayContaining([
					expect.objectContaining({ id: "messages_monthly", balance: 5 }),
				]),
			});
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("commits once after folding every record in a fetched batch", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [initialState],
			});
			const firstOutcome = createMutation({ state: initialState });
			const secondOutcome = createMutation({
				state: applyMutation({
					state: initialState,
					mutation: firstOutcome,
				}),
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
				customerEntitlements: expect.arrayContaining([
					expect.objectContaining({ id: "messages_monthly", balance: 0 }),
				]),
			});
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("repairs a lagging group offset after a commit failure", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [initialState],
			});
			const firstOutcome = createMutation({ state: initialState });
			const secondOutcome = createMutation({
				state: applyMutation({
					state: initialState,
					mutation: firstOutcome,
				}),
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
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [initialState],
			});
			const firstOutcome = createMutation({ state: initialState });
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
			const secondOutcome = createMutation({
				state: currentState,
				commandId: "cmd_2",
				requestId: "req_2",
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 1n,
				mutation: secondOutcome,
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

	test("a replayed record lands in the partition's recent commands, applied or already applied", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [initialState],
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});
			await consumer.start();
			const recentCommands = createRecentCommands({
				windowMs: 600_000,
				now: () => 0,
			});
			consumer.createReplay({ partition, recentCommands });

			const first = createMutation({ state: initialState });
			await consumerPort.deliver({
				offset: "0",
				...serializeMeteringRecord({ record: first }),
			});

			const currentState = fixture.store.readState({ identity });
			if (!currentState) throw new Error("Expected current state");
			const second = createMutation({
				state: currentState,
				commandId: "cmd_2",
				requestId: "req_2",
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 1n,
				mutation: second,
			});
			await consumerPort.deliver({
				offset: "1",
				...serializeMeteringRecord({ record: second }),
			});

			expect(recentCommands.read({ identity, commandId: "cmd_1" })).toEqual({
				fingerprint: first.receipt.fingerprint,
			});
			expect(recentCommands.read({ identity, commandId: "cmd_2" })).toEqual({
				fingerprint: second.receipt.fingerprint,
			});
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("commits across valid gaps in delivered Kafka offsets", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [state],
			});
			const serialized = serializeKafkaMutationRecord({
				mutation: createMutation({ state }),
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

	test("parks the partition when SQLite progress is behind the Kafka log start", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [initialState],
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 0n,
				mutation: createMutation({ state: initialState }),
			});
			const restoredState = fixture.store.readState({ identity });
			if (!restoredState) throw new Error("Expected restored state");
			const serialized = serializeMeteringRecord({
				record: createMutation({
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
			const { unavailable } = await followPartition({
				consumer,
				targetNextOffset: 1n,
			});
			await consumerPort.deliver({ offset: "5000", ...serialized });

			// The batch settles without a throw: the partition is parked, paused and left where it was.
			expect(unavailable).toHaveLength(1);
			expect(unavailable[0]).toBeInstanceOf(StateBehindKafkaLogStartError);
			expect(unavailable[0]).toMatchObject({ retriable: false });
			expect(consumerPort.lifecycle).toContain("pause");
			expect(consumerPort.commits).toEqual([]);
			expect(consumerPort.seeks).toEqual([{ topic, partition, offset: "1" }]);
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
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [state],
			});
			const serialized = serializeKafkaMutationRecord({
				mutation: createMutation({ state }),
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
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [initialState],
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 0n,
				mutation: createMutation({ state: initialState }),
			});
			const restoredState = fixture.store.readState({ identity });
			if (!restoredState) throw new Error("Expected restored state");
			const serialized = serializeMeteringRecord({
				record: createMutation({
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
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [initialState],
			});
			const firstSerialized = serializeKafkaMutationRecord({
				mutation: createMutation({ state: initialState }),
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
				record: createMutation({
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

	test("a malformed record parks its partition: nothing committed or advanced, no throw", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [state],
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			const { unavailable } = await followPartition({
				consumer,
				targetNextOffset: 0n,
			});
			await consumerPort.deliver({
				offset: "0",
				key: Buffer.from("invalid", "utf8"),
				value: Buffer.from("not-json", "utf8"),
			});

			expect(unavailable).toHaveLength(1);
			expect(unavailable[0]).toMatchObject({
				name: "KafkaPartitionInvariantError",
				retriable: false,
				offset: "0",
			});
			expect(consumerPort.lifecycle).toContain("pause");
			expect(consumerPort.commits).toEqual([]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
			expect(fixture.store.readState({ identity })?.revision).toBe(0);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("an invalid record offset parks its partition", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [state],
			});
			const serialized = serializeKafkaMutationRecord({
				mutation: createMutation({ state }),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaMeteringConsumer({
				consumer: consumerPort,
				partitionOffsets: createFakeKafkaPartitionOffsets(),
				topic,
				stateStore: fixture.store,
			});

			await consumer.start();
			const { unavailable } = await followPartition({
				consumer,
				targetNextOffset: 0n,
			});
			await consumerPort.deliver({ offset: "-1", ...serialized });

			expect(unavailable).toHaveLength(1);
			expect(unavailable[0]).toMatchObject({
				name: "KafkaPartitionInvariantError",
				retriable: false,
			});
			expect(consumerPort.commits).toEqual([]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("an out-of-order outcome parks its partition as an invariant failure", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [initialState],
			});
			const firstOutcome = createMutation({ state: initialState });
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 0n,
				mutation: firstOutcome,
			});
			const staleOutcome = createMutation({
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
			const { unavailable } = await followPartition({
				consumer,
				targetNextOffset: 1n,
			});
			await consumerPort.deliver({
				offset: "1",
				...serializeMeteringRecord({ record: staleOutcome }),
			});

			expect(unavailable).toHaveLength(1);
			expect(unavailable[0]).toMatchObject({
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
				record: createMutation({ state: createState() }),
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
	const replay = consumer.createReplay({
		partition,
		recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
	});
	try {
		const state = createState();
		restoreSubjectStates({
			store: fixture.store,
			topic,
			partition,
			states: [state],
		});
		const record = serializeMeteringRecord({
			record: createMutation({ state }),
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

		const replacement = consumer.createReplay({
			partition,
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
		});
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

describe("replay window", () => {
	test.each([
		{
			scenario: "the store is already caught up",
			previousNextOffset: null,
			targetNextOffset: 3n,
		},
		{
			scenario: "a previous runtime reached the target",
			previousNextOffset: 4n,
			targetNextOffset: 4n,
		},
	])(
		"rebuilds dedup memory before readiness when $scenario",
		async ({ previousNextOffset, targetNextOffset }) => {
			const fixture = createStoreFixture({ nextOffset: 3n });
			const port = createFakeKafkaConsumer();
			const tracker = createProgressTracker();
			if (previousNextOffset !== null)
				tracker.advance({ topic, partition, nextOffset: previousNextOffset });
			const consumer = createKafkaMeteringConsumer({
				consumer: port,
				partitionOffsets: {
					...createFakeKafkaPartitionOffsets({
						high: targetNextOffset.toString(),
					}),
					fetchTopicOffsetsByTimestamp: async () => [
						{ partition, offset: "1" },
					],
				},
				stateStore: fixture.store,
				positionTracker: tracker,
				topic,
			});
			const recentCommands = createRecentCommands({
				windowMs: 600_000,
				now: () => 0,
			});
			const replay = consumer.createReplay({ partition, recentCommands });
			try {
				const state = createState();
				restoreSubjectStates({
					store: fixture.store,
					topic,
					partition,
					states: [state],
				});
				await consumer.start();
				await replay.readLogRange({
					topic,
					partition,
					signal: new AbortController().signal,
				});
				let ready = false;
				const catchUp = replay
					.startAndCatchUp({
						topic,
						partition,
						targetNextOffset,
						onUnavailable: () => undefined,
					})
					.then(() => {
						ready = true;
					});
				void catchUp.catch(() => undefined);
				await new Promise<void>(setImmediate);
				expect(ready).toBe(false);
				expect(port.seeks).toEqual([{ topic, partition, offset: "1" }]);

				const first = createMutation({ state, commandId: "cmd_first" });
				await port.deliver({
					offset: "1",
					...serializeMeteringRecord({ record: first }),
				});
				expect(recentCommands.read({ identity, commandId: first.id })).toEqual({
					fingerprint: first.receipt.fingerprint,
				});
				expect(ready).toBe(false);

				const last = createMutation({ state, commandId: "cmd_last" });
				await port.deliver({
					offset: "2",
					...serializeMeteringRecord({ record: last }),
				});
				if (targetNextOffset > 3n) {
					await new Promise<void>(setImmediate);
					expect(ready).toBe(false);
					port.emitEndBatchProcess({ batchSize: 0, lastOffset: "3" });
				}
				await catchUp;
				expect(ready).toBe(true);
				expect(recentCommands.read({ identity, commandId: last.id })).toEqual({
					fingerprint: last.receipt.fingerprint,
				});
				expect(fixture.store.readState({ identity })).toEqual(state);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
			} finally {
				await replay.stop();
				await consumer.stop();
				closeStoreFixture(fixture);
			}
		},
	);
	function createWindowedHandler({
		floor,
		withReplay = true,
	}: {
		floor: bigint | null;
		withReplay?: boolean;
	}) {
		const fixture = createStoreFixture({ nextOffset: 3n });
		const recentCommands = createRecentCommands({
			windowMs: 600_000,
			now: () => 0,
		});
		const warnings: unknown[] = [];
		const parked: unknown[] = [];
		const replay = {
			markUnavailable: ({ cause }: { cause: unknown }) => parked.push(cause),
		};
		const handler = createMeteringRecordHandler({
			ctx: {
				stateStore: fixture.store,
				partitionOffsets: {
					fetchTopicOffsets: async () => {
						throw new Error("No broker read expected");
					},
				},
				recentCommandsByPartition: new Map([[partition, recentCommands]]),
				replayFloorByPartition: new Map(
					floor === null ? [] : [[partition, floor]],
				),
				replayByPartition: new Map(withReplay ? [[partition, replay]] : []),
				logger: { warn: (...args: unknown[]) => warnings.push(args) },
			},
		});
		return { fixture, recentCommands, handler, warnings, parked };
	}

	test("inside the window a below-bookmark record is read, remembered and not skipped past", async () => {
		const { fixture, recentCommands, handler } = createWindowedHandler({
			floor: 1n,
		});
		try {
			expect(
				handler.readResumeOffset({ topic, partition, firstOffset: 2n }),
			).toBeNull();
			expect(
				handler.readResumeOffset({ topic, partition, firstOffset: 0n }),
			).toBe(1n);

			const state = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [state],
			});
			const record = createMutation({ state });
			const result = await handler.applyRecord({
				position: { topic, partition, offset: 2n },
				record,
			});
			expect(result).toBeUndefined();
			expect(recentCommands.read({ identity, commandId: record.id })).toEqual({
				fingerprint: record.receipt.fingerprint,
			});
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("without a window a below-bookmark record still skips to the bookmark, as before", async () => {
		const { fixture, handler } = createWindowedHandler({ floor: null });
		try {
			expect(
				handler.readResumeOffset({ topic, partition, firstOffset: 2n }),
			).toBe(3n);
			const state = createState();
			restoreSubjectStates({
				store: fixture.store,
				topic,
				partition,
				states: [state],
			});
			const result = await handler.applyRecord({
				position: { topic, partition, offset: 2n },
				record: createMutation({ state }),
			});
			expect(result).toEqual({ nextOffset: 3n });
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("a record it cannot read inside the window is skipped with a warning; outside it the partition is parked", () => {
		const { fixture, handler, warnings, parked } = createWindowedHandler({
			floor: 1n,
		});
		try {
			if (!handler.onRecordError) throw new Error("Expected an error boundary");
			expect(
				handler.onRecordError({
					topic,
					partition,
					offset: "2",
					cause: new InvalidRecordError(),
				}),
			).toBeUndefined();
			expect(warnings).toHaveLength(1);
			expect(parked).toEqual([]);

			expect(
				handler.onRecordError({
					topic,
					partition,
					offset: "5",
					cause: new InvalidRecordError(),
				}),
			).toBeUndefined();
			expect(parked).toHaveLength(1);
			expect(parked[0]).toBeInstanceOf(KafkaPartitionInvariantError);
			expect((parked[0] as KafkaPartitionInvariantError).offset).toBe("5");
			expect(warnings).toHaveLength(2);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("with no replay to park, an unreadable record still fails the batch", () => {
		const { fixture, handler } = createWindowedHandler({
			floor: null,
			withReplay: false,
		});
		try {
			expect(() =>
				handler.onRecordError?.({
					topic,
					partition,
					offset: "5",
					cause: new InvalidRecordError(),
				}),
			).toThrow(KafkaPartitionInvariantError);
			expect(() =>
				handler.onRecordError?.({
					topic,
					partition,
					offset: "5",
					cause: new Error("not an invariant"),
				}),
			).toThrow("not an invariant");
		} finally {
			closeStoreFixture(fixture);
		}
	});
});

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
				recentCommandsByPartition: new Map(),
				replayFloorByPartition: new Map(),
				replayByPartition: new Map(),
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
					record: createInitializeMutation({
						state,
						commandId: "initial",
					}),
				}),
			).toBeUndefined();
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(4n);
			const record = createMutation({
				state: { ...state, revision: 1 },
			});
			expect(
				handler.applyRecord({
					position: { topic, partition, offset: 4n },
					record,
				}),
			).toBeUndefined();
			expect(
				fixture.store.readState({ identity: state.identity })?.revision,
			).toBe(2);
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
				recentCommandsByPartition: new Map(),
				replayFloorByPartition: new Map(),
				replayByPartition: new Map(),
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
				recentCommandsByPartition: new Map(),
				replayFloorByPartition: new Map(),
				replayByPartition: new Map(),
			},
		});
		const invariant = new InvalidRecordError();
		const ordinary = new Error("store disconnected");
		function throwInvariant(): TopicRecordResult {
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
				replayWindow: { windowMs: 600_000, lookupTimeoutMs: 50, now: () => 0 },
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
