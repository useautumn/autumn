import { describe, expect, test } from "bun:test";
import {
	createKafkaTrackOutcomeConsumer,
	type KafkaTrackOutcomeConsumerPort,
	type KafkaTrackOutcomeConsumerRunConfig,
} from "../../../src/kafka/kafkaTrackOutcomeConsumer.js";
import { serializeKafkaTrackOutcomeRecord } from "../../../src/kafka/trackOutcomeRecord.js";
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

type FakeKafkaConsumer = KafkaTrackOutcomeConsumerPort & {
	commits: Commit[][];
	lifecycle: string[];
	runConfig: KafkaTrackOutcomeConsumerRunConfig | null;
	seeks: Commit[];
	deliver: (params: {
		offset: string;
		key: Buffer | null;
		value: Buffer | null;
	}) => Promise<void>;
	failNextCommit: (error: Error) => void;
};

const createFakeKafkaConsumer = ({
	onCommit,
}: {
	onCommit?: () => void;
} = {}): FakeKafkaConsumer => {
	let eachMessage: KafkaTrackOutcomeConsumerRunConfig["eachMessage"] | null =
		null;
	let nextCommitError: Error | null = null;
	const commits: Commit[][] = [];
	const seeks: Commit[] = [];
	const lifecycle: string[] = [];

	return {
		commits,
		seeks,
		lifecycle,
		runConfig: null,
		connect: async () => {
			lifecycle.push("connect");
		},
		subscribe: async () => {
			lifecycle.push("subscribe");
		},
		run: async function (config) {
			lifecycle.push("run");
			if (!config?.eachMessage) {
				throw new Error("Expected an eachMessage consumer configuration");
			}
			const runConfig = config as KafkaTrackOutcomeConsumerRunConfig;
			this.runConfig = runConfig;
			eachMessage = runConfig.eachMessage;
		},
		commitOffsets: async (offsets) => {
			lifecycle.push("commit");
			onCommit?.();
			if (nextCommitError) {
				const error = nextCommitError;
				nextCommitError = null;
				throw error;
			}
			commits.push(offsets);
		},
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
		deliver: async ({ offset, key, value }) => {
			if (!eachMessage) throw new Error("Consumer has not started");
			await eachMessage({
				topic,
				partition,
				message: {
					offset,
					key,
					value,
					timestamp: "0",
					attributes: 0,
					headers: {},
				},
				heartbeat: async () => undefined,
				pause: () => () => undefined,
			});
		},
		failNextCommit: (error) => {
			nextCommitError = error;
		},
	};
};

describe("Kafka track outcome consumer", () => {
	test("applies SQLite state before committing the Kafka offset", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.initializeState({ state });
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state }),
			});
			const consumerPort = createFakeKafkaConsumer({
				onCommit: () => {
					expect(fixture.store.readState({ identity })?.revision).toBe(1);
					expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
				},
			});
			const consumer = createKafkaTrackOutcomeConsumer({
				consumer: consumerPort,
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

	test("repairs a lagging group offset after a commit failure", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.initializeState({ state });
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state }),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaTrackOutcomeConsumer({
				consumer: consumerPort,
				topic,
				stateStore: fixture.store,
			});
			await consumer.start();

			consumerPort.failNextCommit(new Error("rebalance during commit"));
			await expect(
				consumerPort.deliver({ offset: "0", ...serialized }),
			).rejects.toThrow("rebalance during commit");
			expect(fixture.store.readState({ identity })?.revision).toBe(1);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);

			await consumerPort.deliver({ offset: "0", ...serialized });

			expect(consumerPort.commits).toEqual([
				[{ topic, partition, offset: "1" }],
			]);
			expect(consumerPort.seeks).toEqual([{ topic, partition, offset: "1" }]);
			expect(fixture.store.readState({ identity })?.revision).toBe(1);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("commits across valid gaps in delivered Kafka offsets", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.initializeState({ state });
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({ state }),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaTrackOutcomeConsumer({
				consumer: consumerPort,
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

	test("rewinds a new assignment to SQLite progress before folding", async () => {
		const fixture = createStoreFixture();
		try {
			const initialState = createState();
			fixture.store.initializeState({ state: initialState });
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 0n },
				outcome: createOutcome({ state: initialState }),
			});
			const restoredState = fixture.store.readState({ identity });
			if (!restoredState) throw new Error("Expected restored state");
			const serialized = serializeKafkaTrackOutcomeRecord({
				outcome: createOutcome({
					state: restoredState,
					commandId: "cmd_2",
					requestId: "req_2",
				}),
			});
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaTrackOutcomeConsumer({
				consumer: consumerPort,
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

	test("does not commit or advance a malformed record", async () => {
		const fixture = createStoreFixture();
		try {
			const state = createState();
			fixture.store.initializeState({ state });
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaTrackOutcomeConsumer({
				consumer: consumerPort,
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
			).rejects.toThrow();

			expect(consumerPort.commits).toEqual([]);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(0n);
			expect(fixture.store.readState({ identity })?.revision).toBe(0);
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("stops consumption before disconnecting", async () => {
		const fixture = createStoreFixture();
		try {
			const consumerPort = createFakeKafkaConsumer();
			const consumer = createKafkaTrackOutcomeConsumer({
				consumer: consumerPort,
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
