import { describe, expect, test } from "bun:test";
import {
	type KafkaProducer,
	type KafkaTransaction,
	KafkaTransactionStateUnknownError,
	parseMeteringRecord,
} from "@autumn/kafka";
import type { ProducerRecord, RecordMetadata } from "kafkajs";
import { createMutationPublisher } from "../../../src/kafka/createMutationPublisher.js";
import { MutationBatchNotCommittedError } from "../../../src/processor/writer/writerErrors.js";
import {
	createMutation,
	createState,
	partition,
	topic,
} from "./kafka-test-fixtures.js";

type FakeProducerOptions = {
	offsetError?: Error;
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
	offsetError,
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
		sendOffsets: async (offsets) => {
			lifecycle.push(`offset:${offsets.topics[0]?.partitions[0]?.offset}`);
			if (offsetError) throw offsetError;
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
	test("source offsets commit with the mutation, while offset-only completions use the same transaction fence", async () => {
		const fake = createFakeProducer();
		const appender = createMutationPublisher({
			ctx: { producer: fake.producer },
			config: { commandTopic: "commands", groupId: "workers" },
		});
		const mutation = {
			...createMutation({ state: createState(), commandId: "queued" }),
			source: { commandOffset: "41" },
		};
		await appender.appendCommitted({ topic, partition, outcomes: [mutation] });
		expect(fake.lifecycle).toEqual([
			"transaction",
			"send",
			"offset:42",
			"commit",
		]);
		fake.lifecycle.length = 0;
		await appender.commitCommandOffset({ topic, partition, nextOffset: 43n });
		expect(fake.lifecycle).toEqual(["transaction", "offset:43", "commit"]);
	});

	test("an offset send failure aborts the mutation transaction", async () => {
		const fake = createFakeProducer({
			offsetError: new Error("offset refused"),
		});
		const appender = createMutationPublisher({
			ctx: { producer: fake.producer },
			config: { commandTopic: "commands", groupId: "workers" },
		});
		const mutation = {
			...createMutation({ state: createState(), commandId: "queued" }),
			source: { commandOffset: "41" },
		};
		await expect(
			appender.appendCommitted({ topic, partition, outcomes: [mutation] }),
		).rejects.toBeInstanceOf(MutationBatchNotCommittedError);
		expect(fake.lifecycle).toEqual([
			"transaction",
			"send",
			"offset:42",
			"abort",
		]);
	});

	test("commits one ordered partition batch and returns its first offset", async () => {
		const firstOutcome = createMutation({
			state: createState(),
			commandId: "cmd_1",
		});
		const secondOutcome = createMutation({
			state: createState(),
			commandId: "cmd_2",
		});
		const fake = createFakeProducer();
		const appender = createMutationPublisher({
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
				parseMeteringRecord({
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
		const appender = createMutationPublisher({
			ctx: { producer: fake.producer },
		});
		let settled = false;
		const appendPromise = appender
			.appendCommitted({
				topic,
				partition,
				outcomes: [createMutation({ state: createState() })],
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
		const appender = createMutationPublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			appender.appendCommitted({
				topic,
				partition,
				outcomes: [createMutation({ state: createState() })],
			}),
		).rejects.toBeInstanceOf(MutationBatchNotCommittedError);
		expect(fake.lifecycle).toEqual(["transaction"]);
	});

	test("aborts a failed send before declaring the batch not committed", async () => {
		const fake = createFakeProducer({ sendError: new Error("send failed") });
		const appender = createMutationPublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			appender.appendCommitted({
				topic,
				partition,
				outcomes: [createMutation({ state: createState() })],
			}),
		).rejects.toBeInstanceOf(MutationBatchNotCommittedError);
		expect(fake.lifecycle).toEqual(["transaction", "send", "abort"]);
	});

	test("parks on a failed abort because the transaction state is unknown", async () => {
		const abortError = new Error("abort failed");
		const fake = createFakeProducer({
			sendError: new Error("send failed"),
			abortError,
		});
		const appender = createMutationPublisher({
			ctx: { producer: fake.producer },
		});

		const error = await appender
			.appendCommitted({
				topic,
				partition,
				outcomes: [createMutation({ state: createState() })],
			})
			.catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(KafkaTransactionStateUnknownError);
		expect(error).not.toBeInstanceOf(MutationBatchNotCommittedError);
		expect(error).toMatchObject({
			failureStage: "abort",
			abortCause: abortError,
		});
		expect(fake.lifecycle).toEqual(["transaction", "send", "abort"]);
	});

	test("parks on commit failure without claiming the transaction was aborted", async () => {
		const commitError = new Error("commit response lost");
		const fake = createFakeProducer({ commitError });
		const appender = createMutationPublisher({
			ctx: { producer: fake.producer },
		});

		const error = await appender
			.appendCommitted({
				topic,
				partition,
				outcomes: [createMutation({ state: createState() })],
			})
			.catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(KafkaTransactionStateUnknownError);
		expect(error).not.toBeInstanceOf(MutationBatchNotCommittedError);
		expect(error).toMatchObject({ failureStage: "commit", cause: commitError });
		expect(fake.lifecycle).toEqual(["transaction", "send", "commit"]);
	});

	test("aborts when Kafka does not return usable metadata for the batch", async () => {
		const fake = createFakeProducer({ metadata: [] });
		const appender = createMutationPublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			appender.appendCommitted({
				topic,
				partition,
				outcomes: [createMutation({ state: createState() })],
			}),
		).rejects.toBeInstanceOf(MutationBatchNotCommittedError);
		expect(fake.lifecycle).toEqual(["transaction", "send", "abort"]);
	});

	test("rejects an empty batch before opening a transaction", async () => {
		const fake = createFakeProducer();
		const appender = createMutationPublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			appender.appendCommitted({ topic, partition, outcomes: [] }),
		).rejects.toBeInstanceOf(RangeError);
		expect(fake.lifecycle).toEqual([]);
	});
});

test("an appended batch is remembered as this writer's own offsets", async () => {
	const fake = createFakeProducer();
	const remembered: { from: bigint; to: bigint }[] = [];
	const appender = createMutationPublisher({
		ctx: {
			producer: fake.producer,
			producedOffsets: {
				remember: (range) => {
					remembered.push(range);
				},
				has: () => false,
				size: () => remembered.length,
			},
		},
	});
	const state = createState();
	await appender.appendCommitted({
		topic,
		partition,
		outcomes: [
			createMutation({ state, commandId: "a" }),
			createMutation({ state, commandId: "b" }),
		],
	});
	// The fake producer reports baseOffset 41 for every batch.
	expect(remembered).toEqual([{ from: 41n, to: 42n }]);
});

test("an appended batch adds its encoded bytes to the partition's load", async () => {
	const fake = createFakeProducer();
	const recorded: { partition: number; bytes: number }[] = [];
	const appender = createMutationPublisher({
		ctx: {
			producer: fake.producer,
			partitionLoad: {
				record: (entry) => {
					recorded.push(entry);
				},
				forget: () => undefined,
				claim: () => undefined,
				release: () => undefined,
				owned: () => new Set(),
				snapshot: () => new Map(),
			},
		},
	});
	const state = createState();
	const outcomes = [
		createMutation({ state, commandId: "a" }),
		createMutation({ state, commandId: "b" }),
	];
	await appender.appendCommitted({ topic, partition, outcomes });
	const expected = outcomes.reduce(
		(sum, record) => sum + appender.encodedBytesOf({ record }),
		0,
	);
	expect(recorded).toEqual([{ partition, bytes: expected }]);
	expect(expected).toBeGreaterThan(0);
});
