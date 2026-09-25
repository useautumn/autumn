import { describe, expect, test } from "bun:test";
import type { MutationRecord } from "@autumn/balance-engine";
import {
	CompressionTypes,
	KafkaJSProtocolError,
	type ProducerRecord,
	type RecordMetadata,
} from "kafkajs";
import {
	createMeteringPublisher,
	KafkaBatchNotCommittedError,
	type KafkaProducer,
	type KafkaTransaction,
	KafkaTransactionStateUnknownError,
	OWNER_EPOCH_HEADER,
	sendIdempotentBatch,
	sendTransactionalBatch,
} from "../../src/kafka.js";
import { createState, createTrackMutation } from "../meteringFixtures.js";

function transactionalBatchTests(): void {
	const topic = "metering-events-v1";
	const partition = 0;
	const message = { key: Buffer.from("k"), value: Buffer.from("v") };

	function createFakeProducer({
		metadata = [
			{ topicName: topic, partition, errorCode: 0, baseOffset: "41" },
		],
		transactionError,
		sendError,
		commitError,
		abortError,
	}: {
		metadata?: RecordMetadata[];
		transactionError?: Error;
		sendError?: Error;
		commitError?: Error;
		abortError?: Error;
	} = {}): {
		producer: KafkaProducer;
		lifecycle: string[];
		records: ProducerRecord[];
	} {
		const lifecycle: string[] = [];
		const records: ProducerRecord[] = [];

		async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
			lifecycle.push("send");
			records.push(record);
			if (sendError) throw sendError;
			return metadata;
		}

		async function commit(): Promise<void> {
			lifecycle.push("commit");
			if (commitError) throw commitError;
		}

		async function abort(): Promise<void> {
			lifecycle.push("abort");
			if (abortError) throw abortError;
		}

		async function transaction(): Promise<KafkaTransaction> {
			lifecycle.push("transaction");
			if (transactionError) throw transactionError;
			return { send, commit, abort, sendOffsets: async () => {} };
		}

		return { lifecycle, records, producer: { transaction } };
	}

	async function commitsOrderedPartitionBatch(): Promise<void> {
		const fake = createFakeProducer();
		const second = { key: Buffer.from("next"), value: Buffer.from("value") };
		await expect(
			sendTransactionalBatch({
				producer: fake.producer,
				topic,
				partition,
				messages: [message, second],
			}),
		).resolves.toEqual({ baseOffset: 41n });
		expect(fake.lifecycle).toEqual(["transaction", "send", "commit"]);
		expect(fake.records).toEqual([
			{
				topic,
				messages: [
					{ ...message, partition },
					{ ...second, partition },
				],
				acks: -1,
				compression: CompressionTypes.GZIP,
			},
		]);
	}

	async function classifiesTransactionAcquisitionFailure(): Promise<void> {
		const fake = createFakeProducer({
			transactionError: new Error("producer unavailable"),
		});
		await expect(
			sendTransactionalBatch({
				producer: fake.producer,
				topic,
				partition,
				messages: [message],
			}),
		).rejects.toBeInstanceOf(KafkaBatchNotCommittedError);
		expect(fake.lifecycle).toEqual(["transaction"]);
	}

	async function abortsFailedSend(): Promise<void> {
		const fake = createFakeProducer({ sendError: new Error("send failed") });
		await expect(
			sendTransactionalBatch({
				producer: fake.producer,
				topic,
				partition,
				messages: [message],
			}),
		).rejects.toBeInstanceOf(KafkaBatchNotCommittedError);
		expect(fake.lifecycle).toEqual(["transaction", "send", "abort"]);
	}

	async function preservesUnknownAbortState(): Promise<void> {
		const sendError = new Error("send failed");
		const abortError = new Error("abort failed");
		const fake = createFakeProducer({ sendError, abortError });
		let error: unknown;
		try {
			await sendTransactionalBatch({
				producer: fake.producer,
				topic,
				partition,
				messages: [message],
			});
		} catch (cause) {
			error = cause;
		}
		expect(error).toBeInstanceOf(KafkaTransactionStateUnknownError);
		expect(error).toMatchObject({
			failureStage: "abort",
			cause: sendError,
			abortCause: abortError,
		});
	}

	async function preservesUnknownCommitState(): Promise<void> {
		const cause = new Error("commit response lost");
		const fake = createFakeProducer({ commitError: cause });
		await expect(
			sendTransactionalBatch({
				producer: fake.producer,
				topic,
				partition,
				messages: [message],
			}),
		).rejects.toMatchObject({
			name: "KafkaTransactionStateUnknownError",
			failureStage: "commit",
			cause,
		});
		expect(fake.lifecycle).toEqual(["transaction", "send", "commit"]);
	}

	async function rejectsInvalidMetadataBeforeCommit(): Promise<void> {
		const valid = {
			topicName: topic,
			partition,
			errorCode: 0,
			baseOffset: "41",
		};
		const invalidBatches: RecordMetadata[][] = [
			[],
			[valid, valid],
			[{ ...valid, topicName: "another-topic" }],
			[{ ...valid, partition: partition + 1 }],
			[{ ...valid, errorCode: 1 }],
			[{ ...valid, baseOffset: "-1" }],
			[{ ...valid, baseOffset: "01" }],
			[{ ...valid, baseOffset: "1.5" }],
			[{ topicName: topic, partition, errorCode: 0 }],
		];
		for (const metadata of invalidBatches) {
			const fake = createFakeProducer({ metadata });
			await expect(
				sendTransactionalBatch({
					producer: fake.producer,
					topic,
					partition,
					messages: [message],
				}),
			).rejects.toBeInstanceOf(KafkaBatchNotCommittedError);
			expect(fake.lifecycle).toEqual(["transaction", "send", "abort"]);
		}
	}

	async function acceptsFallbackMetadataOffset(): Promise<void> {
		const fake = createFakeProducer({
			metadata: [{ topicName: topic, partition, errorCode: 0, offset: "0" }],
		});
		await expect(
			sendTransactionalBatch({
				producer: fake.producer,
				topic,
				partition,
				messages: [message],
			}),
		).resolves.toEqual({ baseOffset: 0n });
		expect(fake.lifecycle).toEqual(["transaction", "send", "commit"]);
	}

	async function rejectsEmptyBatchBeforeTransaction(): Promise<void> {
		const fake = createFakeProducer();
		await expect(
			sendTransactionalBatch({
				producer: fake.producer,
				topic,
				partition,
				messages: [],
			}),
		).rejects.toBeInstanceOf(RangeError);
		expect(fake.lifecycle).toEqual([]);
	}

	test(
		"commits one ordered partition batch and returns its first offset",
		commitsOrderedPartitionBatch,
	);
	test(
		"classifies transaction acquisition failure as not committed",
		classifiesTransactionAcquisitionFailure,
	);
	test(
		"aborts a failed send before declaring the batch not committed",
		abortsFailedSend,
	);
	test(
		"parks on a failed abort because transaction state is unknown",
		preservesUnknownAbortState,
	);
	test(
		"keeps an ambiguous commit unknown without trying to abort",
		preservesUnknownCommitState,
	);
	test(
		"aborts invalid batch metadata without committing",
		rejectsInvalidMetadataBeforeCommit,
	);
	test("accepts Kafka's fallback offset field", acceptsFallbackMetadataOffset);
	test(
		"rejects an empty batch before opening a transaction",
		rejectsEmptyBatchBeforeTransaction,
	);
}

function meteringPublisherTests(): void {
	const identity = {
		orgId: "org_1",
		env: "sandbox",
		customerId: "cus_1",
		entityId: null,
	} as const;
	const topic = "metering";
	const partition = 4;
	const baseOffset = "9007199254740993";

	function createOutcome({ commandId }: { commandId: string }): MutationRecord {
		return createTrackMutation({ state: createState({ identity }), commandId });
	}

	function createProducerFixture({
		commitFailure,
	}: {
		commitFailure?: Error;
	} = {}) {
		const calls: string[] = [];
		const records: ProducerRecord[] = [];

		async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
			calls.push("send");
			records.push(record);
			return [{ topicName: topic, partition, errorCode: 0, baseOffset }];
		}

		async function commit(): Promise<void> {
			calls.push("commit");
			if (commitFailure) throw commitFailure;
		}

		async function abort(): Promise<void> {
			calls.push("abort");
		}

		async function transaction(): Promise<KafkaTransaction> {
			calls.push("transaction");
			return { send, commit, abort, sendOffsets: async () => {} };
		}

		const producer: KafkaProducer = { transaction };
		return { producer, calls, records };
	}

	async function publishesOrderedOutcomes(): Promise<void> {
		const fake = createProducerFixture();
		const publisher = createMeteringPublisher({
			ctx: { producer: fake.producer },
		});
		const records = [
			createOutcome({ commandId: "command-1" }),
			createOutcome({ commandId: "command-2" }),
		];

		await expect(
			publisher.append({ topic, partition, records }),
		).resolves.toEqual({
			baseOffset: BigInt(baseOffset),
		});

		expect(fake.calls).toEqual(["transaction", "send", "commit"]);
		expect(fake.records).toHaveLength(1);
		const expectedMessages = [];
		for (const payload of records) {
			expectedMessages.push({
				partition,
				key: Buffer.from('["org_1","sandbox","cus_1"]', "utf8"),
				value: Buffer.from(
					JSON.stringify({ schemaVersion: 1, type: "mutation", payload }),
					"utf8",
				),
			});
		}
		expect(fake.records[0]).toEqual({
			topic,
			acks: -1,
			compression: CompressionTypes.GZIP,
			messages: expectedMessages,
		});
	}

	async function preservesCommitUncertainty(): Promise<void> {
		const commitFailure = new Error("commit timed out");
		const fake = createProducerFixture({ commitFailure });
		const publisher = createMeteringPublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			publisher.append({
				topic,
				partition,
				records: [createOutcome({ commandId: "command-1" })],
			}),
		).rejects.toBeInstanceOf(KafkaTransactionStateUnknownError);
		expect(fake.calls).toEqual(["transaction", "send", "commit"]);
	}

	async function rejectsEmptyBatch(): Promise<void> {
		const fake = createProducerFixture();
		const publisher = createMeteringPublisher({
			ctx: { producer: fake.producer },
		});

		await expect(
			publisher.append({ topic, partition, records: [] }),
		).rejects.toThrow("Metering record batch cannot be empty");
		expect(fake.calls).toEqual([]);
	}

	test(
		"publishes outcome wire bytes in order and preserves bigint offsets",
		publishesOrderedOutcomes,
	);
	test(
		"does not turn an uncertain commit into a successful append",
		preservesCommitUncertainty,
	);
	test(
		"rejects empty outcome batches before opening a transaction",
		rejectsEmptyBatch,
	);
}

describe("transactionalBatch", transactionalBatchTests);
describe("meteringPublisher", meteringPublisherTests);

describe("idempotent batches", () => {
	const topic = "metering-events-v1";
	const partition = 3;
	const message = { key: Buffer.from("k"), value: Buffer.from("v") };

	function createFakeSender({
		sendError,
		metadata = [{ topicName: topic, partition, errorCode: 0, baseOffset: "7" }],
	}: {
		sendError?: Error;
		metadata?: RecordMetadata[];
	} = {}) {
		const records: ProducerRecord[] = [];
		async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
			records.push(record);
			if (sendError) throw sendError;
			return metadata;
		}
		return { records, sender: { send } };
	}

	test("one produce with acks=all carries the batch and the owner's epoch; nothing else is sent", async () => {
		const fake = createFakeSender();
		const appended = await sendIdempotentBatch({
			sender: fake.sender,
			topic,
			partition,
			messages: [message, message],
			ownerEpoch: "2516",
		});
		expect(appended.baseOffset).toBe(7n);
		expect(fake.records).toHaveLength(1);
		const [record] = fake.records;
		expect(record?.acks).toBe(-1);
		expect(record?.messages).toHaveLength(2);
		expect(record?.messages[0]?.partition).toBe(partition);
		expect(record?.messages[0]?.headers).toEqual({
			[OWNER_EPOCH_HEADER]: "2516",
		});
	});

	test("a broker refusal is a batch not committed; a lost reply leaves the outcome unknown", async () => {
		const refused = createFakeSender({
			sendError: new KafkaJSProtocolError(
				Object.assign(new Error("too large"), {
					type: "MESSAGE_TOO_LARGE",
					code: 10,
					retriable: false,
				}),
			),
		});
		await expect(
			sendIdempotentBatch({
				sender: refused.sender,
				topic,
				partition,
				messages: [message],
			}),
		).rejects.toBeInstanceOf(KafkaBatchNotCommittedError);

		const lost = createFakeSender({
			sendError: new Error("request timed out"),
		});
		await expect(
			sendIdempotentBatch({
				sender: lost.sender,
				topic,
				partition,
				messages: [message],
			}),
		).rejects.toBeInstanceOf(KafkaTransactionStateUnknownError);
	});

	test("the publisher commits command offsets through the consumer when idempotent", async () => {
		const fake = createFakeSender();
		const committed: unknown[] = [];
		const publisher = createMeteringPublisher({
			ctx: {
				producer: {
					transaction: async () => {
						throw new Error("no transactions");
					},
					send: fake.sender.send,
				},
				commit: { mode: "idempotent" },
				ownerEpoch: () => "99",
				commandOffsets: {
					commit: async (offsets) => {
						committed.push(offsets);
					},
				},
			},
		});
		const offsets = {
			consumerGroupId: "g",
			topics: [
				{ topic: "commands", partitions: [{ partition, offset: "12" }] },
			],
		};
		const appended = await publisher.append({
			topic,
			partition,
			records: [createTrackMutation({})],
			offsets,
		});
		expect(appended.baseOffset).toBe(7n);
		expect(committed).toEqual([offsets]);
		expect(fake.records[0]?.messages[0]?.headers).toEqual({
			[OWNER_EPOCH_HEADER]: "99",
		});
	});
});
