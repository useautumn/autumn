import { describe, expect, test } from "bun:test";
import {
	createIdempotentProducerConfig,
	createProducerSession,
	type Kafka,
} from "@autumn/kafka";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
	type WorkerProducer,
} from "../../../src/kafka/createWorkerProducer.js";
import {
	createThreadedProducers,
	type ThreadedProducers,
} from "../../../src/kafka/producerThread/createThreadedProducers.js";
import { OwnedPartitionLogDivergedError } from "../../../src/runtime/runtimeErrors.js";
import { createTestKafka } from "../../fixtures/testKafka.js";

const partition = 0;
const logger = { warn() {}, error() {} };
const chaosThreadUrl = new URL("./producerThreadChaos.ts", import.meta.url)
	.href;

function brokers(): string[] {
	const configured = process.env.KAFKA_BROKERS?.trim();
	if (!configured)
		throw new Error("KAFKA_BROKERS is required for the producer thread test");
	return configured.split(",").map((broker) => broker.trim());
}

/** `expect().rejects` stalls Bun's event loop while the ack loop waits on Atomics.waitAsync, so rejections are caught by hand. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (cause) {
		return cause;
	}
	throw new Error("expected a rejection");
}

async function withTopic<T>(
	run: (context: { kafka: Kafka; topic: string }) => Promise<T>,
): Promise<T> {
	const kafka = createTestKafka({
		clientId: `producer-thread-test-${crypto.randomUUID()}`,
		brokers: brokers(),
	});
	const topic = `producer-thread-${crypto.randomUUID()}`;
	const admin = kafka.admin();
	await admin.connect();
	try {
		await admin.createTopics({
			topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
		});
		return await run({ kafka, topic });
	} finally {
		await admin.deleteTopics({ topics: [topic] }).catch(() => {});
		await admin.disconnect();
	}
}

async function withProducerThread<T>({
	threadUrl,
	run,
}: {
	threadUrl?: string;
	run: (producers: ThreadedProducers) => Promise<T>;
}): Promise<T> {
	const fatal: unknown[] = [];
	const producers = createThreadedProducers({
		ctx: { logger, onFatal: ({ cause }) => fatal.push(cause) },
		config: {
			clientId: `producer-thread-${crypto.randomUUID()}`,
			brokers: brokers(),
			authMode: "none",
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
			sendRingBytes: 1 << 20,
			ackRingBytes: 1 << 16,
			...(threadUrl && { threadUrl }),
		},
	});
	await producers.start();
	try {
		return await run(producers);
	} finally {
		await producers.stop();
		expect(fatal).toEqual([]);
	}
}

/** The writer's own producer stack (session, epoch fence, contiguity check) over the producer thread. */
async function ownerOn({
	producers,
	topic,
	ownerEpoch,
}: {
	producers: ThreadedProducers;
	topic: string;
	ownerEpoch: string;
}): Promise<WorkerProducer> {
	const session = createProducerSession({
		ctx: { kafka: producers },
		config: createWorkerProducerConfig({
			deploymentEnvironment: "producer-thread-test",
			topic,
			partition,
			mode: "idempotent",
			limits: {
				transactionTimeoutMs: 10_000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	});
	const owner = createWorkerProducer({
		ctx: { session, ownerEpoch: () => ownerEpoch },
		config: { topic, partition },
	});
	await owner.connect();
	await owner.fence();
	return owner;
}

async function append({
	owner,
	topic,
	values,
}: {
	owner: WorkerProducer;
	topic: string;
	values: string[];
}): Promise<bigint> {
	const metadata = await owner.send({
		topic,
		messages: values.map((value) => ({
			key: `key-${value}`,
			value,
			partition,
			headers: { source: "producer-thread-test" },
		})),
	});
	return BigInt(metadata[0]?.baseOffset ?? "-1");
}

type LogRecord = {
	offset: bigint;
	key: string | null;
	value: string | null;
	headers: Record<string, string>;
};

async function readLog({
	kafka,
	topic,
	count,
}: {
	kafka: Kafka;
	topic: string;
	count: number;
}): Promise<LogRecord[]> {
	const consumer = kafka.consumer({
		groupId: `producer-thread-reader-${crypto.randomUUID()}`,
	});
	const records: LogRecord[] = [];
	const done = Promise.withResolvers<void>();
	await consumer.connect();
	try {
		await consumer.subscribe({ topics: [topic], fromBeginning: true });
		await consumer.run({
			async eachMessage({ message }) {
				const headers: Record<string, string> = {};
				for (const [name, value] of Object.entries(message.headers ?? {}))
					headers[name] = String(value);
				records.push({
					offset: BigInt(message.offset),
					key: message.key?.toString() ?? null,
					value: message.value?.toString() ?? null,
					headers,
				});
				if (records.length >= count) done.resolve();
			},
		});
		const timeout = setTimeout(() => done.resolve(), 10_000);
		await done.promise;
		clearTimeout(timeout);
		return records;
	} finally {
		await consumer.disconnect();
	}
}

function valuesOf(records: LogRecord[]): (string | null)[] {
	return records
		.filter((record) => record.key?.startsWith("key-") === true)
		.map((record) => record.value);
}

async function dropBrokerSockets(): Promise<number> {
	const channel = new BroadcastChannel("producer-thread-chaos");
	const answered = Promise.withResolvers<number>();
	channel.onmessage = (event: MessageEvent<{ dropped: number }>) =>
		answered.resolve(event.data.dropped);
	channel.postMessage("drop");
	try {
		return await answered.promise;
	} finally {
		channel.close();
	}
}

describe("producer thread against a real broker", () => {
	test("idempotent appends go through the thread and land in order, each batch where its metadata says", async () => {
		await withTopic(async ({ kafka, topic }) => {
			const offsets = await withProducerThread({
				run: async (producers) => {
					const owner = await ownerOn({ producers, topic, ownerEpoch: "1" });
					const sizes = [1, 50, 200];
					const bases: bigint[] = [];
					for (const [batch, size] of sizes.entries())
						bases.push(
							await append({
								owner,
								topic,
								values: Array.from(
									{ length: size },
									(_, index) => `b${batch}-${index}`,
								),
							}),
						);
					await owner.disconnect();
					return bases;
				},
			});
			expect(offsets).toEqual([1n, 2n, 52n]);
			const log = await readLog({ kafka, topic, count: 252 });
			expect(log.map((record) => record.offset)).toEqual(
				Array.from({ length: 252 }, (_, index) => BigInt(index)),
			);
			expect(log[0]?.value).toContain('"owner_fence"');
			expect(log[1]).toMatchObject({
				key: "key-b0-0",
				value: "b0-0",
				headers: { source: "producer-thread-test" },
			});
			expect(log[251]?.value).toBe("b2-199");
		});
	});

	test("a successor's owner fence turns the deposed owner's next append into a log divergence, never an ack", async () => {
		await withTopic(async ({ kafka, topic }) => {
			await withProducerThread({
				run: (previousThread) =>
					withProducerThread({
						run: async (successorThread) => {
							const previous = await ownerOn({
								producers: previousThread,
								topic,
								ownerEpoch: "1",
							});
							expect(
								await append({ owner: previous, topic, values: ["p1"] }),
							).toBe(1n);
							await ownerOn({
								producers: successorThread,
								topic,
								ownerEpoch: "2",
							});
							const diverged = await rejectionOf(
								append({ owner: previous, topic, values: ["zombie"] }),
							);
							expect(diverged).toBeInstanceOf(OwnedPartitionLogDivergedError);
							expect(diverged).toMatchObject({
								expectedOffset: 2n,
								actualOffset: 3n,
							});
							await previous.disconnect();
						},
					}),
			});
			// The zombie's record is in the log, past the epoch-2 fence where readers drop it.
			const log = await readLog({ kafka, topic, count: 4 });
			expect(log.map((record) => record.value)).toEqual([
				expect.stringContaining('"ownerEpoch":"1"'),
				"p1",
				expect.stringContaining('"ownerEpoch":"2"'),
				"zombie",
			]);
		});
	});

	test("cut broker connections are re-dialled, and appends either side of the cut land once each, in order", async () => {
		await withTopic(async ({ kafka, topic }) => {
			await withProducerThread({
				threadUrl: chaosThreadUrl,
				run: async (producers) => {
					const owner = await ownerOn({ producers, topic, ownerEpoch: "1" });
					for (let index = 0; index < 5; index++)
						await append({ owner, topic, values: [`before-${index}`] });
					expect(await dropBrokerSockets()).toBeGreaterThan(0);
					for (let index = 0; index < 5; index++)
						await append({ owner, topic, values: [`after-${index}`] });
					const inFlight = append({ owner, topic, values: ["during"] });
					await dropBrokerSockets();
					expect(await inFlight).toBe(11n);
					await owner.disconnect();
				},
			});
			const log = await readLog({ kafka, topic, count: 12 });
			expect(valuesOf(log)).toEqual([
				...Array.from({ length: 5 }, (_, index) => `before-${index}`),
				...Array.from({ length: 5 }, (_, index) => `after-${index}`),
				"during",
			]);
		});
	});

	test("stop with sends still in flight flushes them: every one is acknowledged and in the log", async () => {
		await withTopic(async ({ kafka, topic }) => {
			const settled = await withProducerThread({
				run: async (producers) => {
					// Concurrent sends, so several are in flight at stop.
					const producer = producers.producer(
						createIdempotentProducerConfig({
							limits: {
								retryCount: 2,
								initialRetryTimeMs: 100,
								maxRetryTimeMs: 1_000,
							},
						}),
					);
					await producer.connect();
					const send = producer.send;
					if (!send) throw new Error("threaded producers offer a plain send");
					const sends = Array.from({ length: 20 }, (_, index) =>
						send({
							topic,
							messages: [
								{ key: `key-${index}`, value: `v${index}`, partition },
							],
						}),
					);
					const stopping = producers.stop();
					const outcomes = await Promise.allSettled(sends);
					await stopping;
					return outcomes;
				},
			});
			expect(settled.map((outcome) => outcome.status)).toEqual(
				Array(20).fill("fulfilled"),
			);
			const log = await readLog({ kafka, topic, count: 20 });
			expect(valuesOf(log).sort()).toEqual(
				Array.from({ length: 20 }, (_, index) => `v${index}`).sort(),
			);
		});
	});
});
