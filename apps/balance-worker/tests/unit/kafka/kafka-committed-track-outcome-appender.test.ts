import { describe, expect, test } from "bun:test";
import {
	type KafkaProducer,
	type KafkaTransaction,
	KafkaTransactionStateUnknownError,
	parseMeteringTrackOutcome,
} from "@autumn/kafka";
import type { ProducerRecord, RecordMetadata } from "kafkajs";
import { createTrackOutcomePublisher } from "../../../src/kafka/createTrackOutcomePublisher.js";
import { TrackOutcomeBatchNotCommittedError } from "../../../src/writer/committedTrackOutcomeAppender.js";
import {
	createOutcome,
	createState,
	partition,
	topic,
} from "./kafka-test-fixtures.js";

type FakeProducerOptions = {
	metadata?: RecordMetadata[];
	transactionError?: Error;
	sendError?: Error;
	commitError?: Error;
	abortError?: Error;
	commitGate?: Promise<void>;
};

const createFakeProducer = ({
	metadata = [
		{
			topicName: topic,
			partition,
			errorCode: 0,
			baseOffset: "41",
		},
	],
	transactionError,
	sendError,
	commitError,
	abortError,
	commitGate = Promise.resolve(),
}: FakeProducerOptions = {}): {
	producer: KafkaProducer;
	lifecycle: string[];
	records: ProducerRecord[];
} => {
	const lifecycle: string[] = [];
	const records: ProducerRecord[] = [];
	const transaction: KafkaTransaction = {
		send: async (record) => {
			lifecycle.push("send");
			records.push(record);
			if (sendError) throw sendError;
			return metadata;
		},
		commit: async () => {
			lifecycle.push("commit");
			if (commitError) throw commitError;
			await commitGate;
		},
		abort: async () => {
			lifecycle.push("abort");
			if (abortError) throw abortError;
		},
	};
	const producer: KafkaProducer = {
		transaction: async () => {
			lifecycle.push("transaction");
			if (transactionError) throw transactionError;
			return transaction;
		},
	};

	return { producer, lifecycle, records };
};

const waitForTurn = async (): Promise<void> => {
	await new Promise<void>((resolve) => setImmediate(resolve));
};

describe("Kafka committed track outcome appender", () => {
	test("commits one ordered partition batch and returns its first offset", async () => {
		const firstOutcome = createOutcome({
			state: createState(),
			commandId: "cmd_1",
		});
		const secondOutcome = createOutcome({
			state: createState(),
			commandId: "cmd_2",
		});
		const fake = createFakeProducer();
		const appender = createTrackOutcomePublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			appender.appendCommitted({
				topic,
				partition,
				outcomes: [firstOutcome, secondOutcome],
			}),
		).resolves.toEqual({ baseOffset: 41n });

		expect(fake.lifecycle).toEqual(["transaction", "send", "commit"]);
		expect(fake.records).toHaveLength(1);
		expect(fake.records[0]).toMatchObject({ topic, acks: -1 });
		expect(fake.records[0]?.messages.map(({ partition }) => partition)).toEqual(
			[0, 0],
		);
		expect(
			fake.records[0]?.messages.map(({ key, value }) =>
				parseMeteringTrackOutcome({
					key: Buffer.isBuffer(key) ? key : null,
					value: Buffer.isBuffer(value) ? value : null,
				}),
			),
		).toEqual([firstOutcome, secondOutcome]);
	});

	test("does not resolve until Kafka commits the transaction", async () => {
		let releaseCommit = (): void => {
			throw new Error("Expected a pending Kafka commit");
		};
		const commitGate = new Promise<void>((resolve) => {
			releaseCommit = resolve;
		});
		const fake = createFakeProducer({ commitGate });
		const appender = createTrackOutcomePublisher({
			ctx: { producer: fake.producer },
		});
		let settled = false;
		const appendPromise = appender
			.appendCommitted({
				topic,
				partition,
				outcomes: [createOutcome({ state: createState() })],
			})
			.finally(() => {
				settled = true;
			});

		await waitForTurn();
		expect(fake.lifecycle).toEqual(["transaction", "send", "commit"]);
		expect(settled).toBe(false);
		releaseCommit();

		await expect(appendPromise).resolves.toEqual({ baseOffset: 41n });
		expect(settled).toBe(true);
	});

	test("classifies transaction acquisition failure as definitely not committed", async () => {
		const fake = createFakeProducer({
			transactionError: new Error("producer unavailable"),
		});
		const appender = createTrackOutcomePublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			appender.appendCommitted({
				topic,
				partition,
				outcomes: [createOutcome({ state: createState() })],
			}),
		).rejects.toBeInstanceOf(TrackOutcomeBatchNotCommittedError);
		expect(fake.lifecycle).toEqual(["transaction"]);
	});

	test("aborts a failed send before declaring the batch not committed", async () => {
		const fake = createFakeProducer({ sendError: new Error("send failed") });
		const appender = createTrackOutcomePublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			appender.appendCommitted({
				topic,
				partition,
				outcomes: [createOutcome({ state: createState() })],
			}),
		).rejects.toBeInstanceOf(TrackOutcomeBatchNotCommittedError);
		expect(fake.lifecycle).toEqual(["transaction", "send", "abort"]);
	});

	test("parks on a failed abort because the transaction state is unknown", async () => {
		const abortError = new Error("abort failed");
		const fake = createFakeProducer({
			sendError: new Error("send failed"),
			abortError,
		});
		const appender = createTrackOutcomePublisher({
			ctx: { producer: fake.producer },
		});

		const error = await appender
			.appendCommitted({
				topic,
				partition,
				outcomes: [createOutcome({ state: createState() })],
			})
			.catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(KafkaTransactionStateUnknownError);
		expect(error).not.toBeInstanceOf(TrackOutcomeBatchNotCommittedError);
		expect(error).toMatchObject({
			failureStage: "abort",
			abortCause: abortError,
		});
		expect(fake.lifecycle).toEqual(["transaction", "send", "abort"]);
	});

	test("parks on commit failure without claiming the transaction was aborted", async () => {
		const commitError = new Error("commit response lost");
		const fake = createFakeProducer({ commitError });
		const appender = createTrackOutcomePublisher({
			ctx: { producer: fake.producer },
		});

		const error = await appender
			.appendCommitted({
				topic,
				partition,
				outcomes: [createOutcome({ state: createState() })],
			})
			.catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(KafkaTransactionStateUnknownError);
		expect(error).not.toBeInstanceOf(TrackOutcomeBatchNotCommittedError);
		expect(error).toMatchObject({ failureStage: "commit", cause: commitError });
		expect(fake.lifecycle).toEqual(["transaction", "send", "commit"]);
	});

	test("aborts when Kafka does not return usable metadata for the batch", async () => {
		const fake = createFakeProducer({ metadata: [] });
		const appender = createTrackOutcomePublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			appender.appendCommitted({
				topic,
				partition,
				outcomes: [createOutcome({ state: createState() })],
			}),
		).rejects.toBeInstanceOf(TrackOutcomeBatchNotCommittedError);
		expect(fake.lifecycle).toEqual(["transaction", "send", "abort"]);
	});

	test("rejects an empty batch before opening a transaction", async () => {
		const fake = createFakeProducer();
		const appender = createTrackOutcomePublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			appender.appendCommitted({ topic, partition, outcomes: [] }),
		).rejects.toBeInstanceOf(RangeError);
		expect(fake.lifecycle).toEqual([]);
	});
});
