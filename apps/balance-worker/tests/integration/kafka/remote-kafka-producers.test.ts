/**
 * The Kafka worker against a real broker: the same writer-side stack (producer session, worker producer,
 * idempotent batch) with its producer on the worker thread must leave the same bytes in the log as the
 * in-thread client, see the same offsets, and raise the same error classes.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	createProducerSession,
	KafkaBatchNotCommittedError,
	type KafkaProducerClient,
	type KafkaProducerFactory,
	KafkaTransactionStateUnknownError,
	OWNER_EPOCH_HEADER,
	sendIdempotentBatch,
} from "@autumn/kafka";
import { Kafka, KafkaJSProtocolError, logLevel } from "kafkajs";
import { createWorkerProducerConfig } from "../../../src/init/workerConfig.js";
import { WORKER_KAFKA_CLIENT_LIMITS } from "../../../src/init/workerResources.js";
import { createWorkerProducer } from "../../../src/kafka/createWorkerProducer.js";
import { OwnedPartitionLogDivergedError } from "../../../src/runtime/runtimeErrors.js";
import { createRemoteKafkaProducers } from "../../../src/serialDecide/createRemoteKafkaProducers.js";

const brokers = (process.env.KAFKA_BROKERS ?? "127.0.0.1:19092").split(",");
const logger = { info() {}, warn() {}, error() {} };
const producerLimits = {
	transactionTimeoutMs: 30_000,
	retryCount: 2,
	initialRetryTimeMs: 5,
	maxRetryTimeMs: 50,
};

type LoggedRecord = {
	offset: string;
	key: string | null;
	value: string | null;
	headers: Record<string, string>;
};

async function readAll({
	kafka,
	topic,
}: {
	kafka: Kafka;
	topic: string;
}): Promise<LoggedRecord[]> {
	const consumer = kafka.consumer({
		groupId: `remote-producers-${crypto.randomUUID()}`,
	});
	await consumer.connect();
	await consumer.subscribe({ topic, fromBeginning: true });
	const records: LoggedRecord[] = [];
	await consumer.run({
		eachMessage: async ({ message }) => {
			const headers: Record<string, string> = {};
			for (const [name, value] of Object.entries(message.headers ?? {}))
				headers[name] = String(value);
			records.push({
				offset: message.offset,
				key: message.key === null ? null : message.key.toString("utf8"),
				value: message.value === null ? null : message.value.toString("utf8"),
				headers,
			});
		},
	});
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		await Bun.sleep(100);
		const settled = records.length;
		await Bun.sleep(200);
		if (settled > 0 && records.length === settled) break;
	}
	await consumer.disconnect();
	return records;
}

function senderOf(producer: {
	send?: KafkaProducerClient["send"];
}): NonNullable<KafkaProducerClient["send"]> {
	if (!producer.send) throw new Error("producer offers no send");
	return producer.send;
}

/** The writer's producer stack, as the runtime factory builds it, over whichever client factory is given. */
function workerProducerOver({
	kafka,
	topic,
	ownerEpoch,
}: {
	kafka: KafkaProducerFactory;
	topic: string;
	ownerEpoch: string;
}) {
	const session = createProducerSession({
		ctx: { kafka },
		config: createWorkerProducerConfig({
			deploymentEnvironment: "test",
			topic,
			partition: 0,
			limits: producerLimits,
			mode: "idempotent",
		}),
	});
	return createWorkerProducer({
		ctx: { session, ownerEpoch: () => ownerEpoch },
		config: { topic, partition: 0 },
	});
}

describe("remote Kafka producers against a broker", () => {
	const kafka = new Kafka({
		clientId: "remote-producers-test",
		brokers,
		logLevel: logLevel.NOTHING,
	});
	const admin = kafka.admin();
	const remote = createRemoteKafkaProducers({
		ctx: {
			logger,
			onFatal: ({ cause }) => {
				throw new Error(`unexpected Kafka worker failure: ${String(cause)}`);
			},
		},
		config: {
			clientId: "remote-producers-test-worker",
			brokers,
			authMode: "none",
			limits: WORKER_KAFKA_CLIENT_LIMITS,
		},
	});
	const topics = {
		remote: `remote-producers-remote-${crypto.randomUUID()}`,
		local: `remote-producers-local-${crypto.randomUUID()}`,
	};

	beforeAll(async () => {
		await admin.connect();
		await admin.createTopics({
			topics: [
				{ topic: topics.remote, numPartitions: 1 },
				{ topic: topics.local, numPartitions: 1 },
			],
			waitForLeaders: true,
		});
		await remote.start();
	});

	afterAll(async () => {
		await remote.stop();
		await admin.deleteTopics({ topics: [topics.remote, topics.local] });
		await admin.disconnect();
	});

	test("a fenced owner's batches land at the same offsets with the same bytes whether the producer is in-thread or on the worker", async () => {
		const batches = [
			[
				{ key: Buffer.from("cus_1"), value: Buffer.from('{"n":1}') },
				{ key: Buffer.from("cus_1"), value: Buffer.from('{"n":2}') },
			],
			[
				{
					key: Buffer.from("cus_2"),
					value: Buffer.from('{"n":3,"big":"' + "x".repeat(4000) + '"}'),
				},
			],
		];
		const landed: Record<"remote" | "local", string[]> = {
			remote: [],
			local: [],
		};
		for (const [side, factory] of [
			["remote", remote],
			["local", kafka],
		] as const) {
			const topic = topics[side];
			const producer = workerProducerOver({
				kafka: factory,
				topic,
				ownerEpoch: "7",
			});
			await producer.connect();
			await producer.fence();
			for (const messages of batches) {
				const { baseOffset } = await sendIdempotentBatch({
					sender: producer,
					topic,
					partition: 0,
					messages,
					ownerEpoch: "7",
				});
				landed[side].push(baseOffset.toString());
			}
			await producer.disconnect();
		}
		expect(landed.remote).toEqual(["1", "3"]);
		expect(landed.local).toEqual(["1", "3"]);
		const [fromRemote, fromLocal] = await Promise.all([
			readAll({ kafka, topic: topics.remote }),
			readAll({ kafka, topic: topics.local }),
		]);
		expect(fromRemote).toEqual(fromLocal);
		expect(fromRemote).toHaveLength(4);
		expect(fromRemote[0]?.headers[OWNER_EPOCH_HEADER]).toBe("7");
		expect(fromRemote[3]?.key).toBe("cus_2");
	}, 30_000);

	test("a foreign write between batches breaks contiguity exactly as it does in-thread", async () => {
		const topic = `remote-producers-diverge-${crypto.randomUUID()}`;
		await admin.createTopics({
			topics: [{ topic, numPartitions: 1 }],
			waitForLeaders: true,
		});
		try {
			const owner = workerProducerOver({
				kafka: remote,
				topic,
				ownerEpoch: "9",
			});
			await owner.connect();
			await owner.fence();
			const intruder = kafka.producer();
			await intruder.connect();
			await intruder.send({
				topic,
				messages: [{ key: "x", value: "y", partition: 0 }],
			});
			await intruder.disconnect();
			let caught: unknown;
			try {
				await sendIdempotentBatch({
					sender: owner,
					topic,
					partition: 0,
					messages: [{ key: Buffer.from("k"), value: Buffer.from("v") }],
					ownerEpoch: "9",
				});
			} catch (cause) {
				caught = cause;
			}
			// The batch landed, so its fate is known to the writer only as "unknown": the divergence is the cause.
			expect(caught).toBeInstanceOf(KafkaTransactionStateUnknownError);
			expect(
				(caught as KafkaTransactionStateUnknownError).cause,
			).toBeInstanceOf(OwnedPartitionLogDivergedError);
			await owner.disconnect();
		} finally {
			await admin.deleteTopics({ topics: [topic] });
		}
	}, 30_000);

	test("a broker refusal is a KafkaJSProtocolError on both sides, with the same type and code", async () => {
		const topic = `remote-producers-refuse-${crypto.randomUUID()}`;
		await admin.createTopics({
			topics: [
				{
					topic,
					numPartitions: 1,
					configEntries: [{ name: "max.message.bytes", value: "1024" }],
				},
			],
			waitForLeaders: true,
		});
		const outcomes: Record<
			"remote" | "local",
			{ type: string; code: number } | null
		> = { remote: null, local: null };
		try {
			for (const [side, factory] of [
				["remote", remote],
				["local", kafka],
			] as const) {
				const producer = factory.producer({
					idempotent: true,
					maxInFlightRequests: 1,
				});
				await producer.connect();
				let caught: unknown;
				try {
					await sendIdempotentBatch({
						sender: { send: senderOf(producer) },
						topic,
						partition: 0,
						// Random bytes: the limit applies after compression.
						messages: [
							{
								key: Buffer.from("k"),
								value: Buffer.from(
									crypto.getRandomValues(new Uint8Array(8192)),
								),
							},
						],
					});
				} catch (cause) {
					caught = cause;
				}
				await producer.disconnect();
				expect(caught).toBeInstanceOf(KafkaBatchNotCommittedError);
				const refusal = (caught as KafkaBatchNotCommittedError)
					.cause as KafkaJSProtocolError;
				expect(refusal).toBeInstanceOf(KafkaJSProtocolError);
				outcomes[side] = { type: refusal.type, code: refusal.code };
			}
		} finally {
			await admin.deleteTopics({ topics: [topic] });
		}
		expect(outcomes.remote).toEqual(outcomes.local);
		expect(outcomes.remote?.type).toBe("MESSAGE_TOO_LARGE");
	}, 30_000);
});
