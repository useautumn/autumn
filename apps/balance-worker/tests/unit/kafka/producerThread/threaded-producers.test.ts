import { describe, expect, spyOn, test } from "bun:test";
import {
	createProducerSession,
	isKafkaProducerFencingCause,
	KafkaBatchNotCommittedError,
	type KafkaProducerClient,
	KafkaTransactionStateUnknownError,
	sendIdempotentBatch,
} from "@autumn/kafka";
import { CompressionTypes, KafkaJSError, KafkaJSProtocolError } from "kafkajs";
import { createThreadedProducers } from "../../../../src/kafka/producerThread/createThreadedProducers.js";
import * as threadProducer from "../../../../src/kafka/producerThread/producers/createThreadProducer.js";
import type { ThreadedProducersScope } from "../../../../src/kafka/producerThread/types/threadedProducersScope.js";
import { isPartitionRestartableCause } from "../../../../src/partitions/health/partitionRestartableCauses.js";
import { PartitionWriterRecoveryRequiredError } from "../../../../src/processor/writer/writerErrors.js";
import { OwnedPartitionRecoveryRequiredError } from "../../../../src/runtime/runtimeErrors.js";

const logger = { info() {}, warn() {}, error() {} };
const threadUrl = new URL("./fakeProducerThread.ts", import.meta.url).href;
const noFatal = ({ cause }: { cause: unknown }) => {
	throw new Error(`unexpected producer thread failure: ${String(cause)}`);
};
const clientConfig = {
	clientId: "test-client",
	brokers: ["fake:9092"],
	authMode: "none" as const,
	limits: {
		connectionTimeoutMs: 1000,
		requestTimeoutMs: 1000,
		retryCount: 1,
		initialRetryTimeMs: 1,
		maxRetryTimeMs: 1,
	},
};

type Echo = {
	config: Record<string, unknown>;
	acks?: number;
	compression?: number;
	messages: {
		key: string | null;
		value: string | null;
		partition?: number;
		headers?: Record<string, string>;
	}[];
};

/** `expect().rejects` stalls Bun's event loop while the ack loop waits on Atomics.waitAsync, so rejections are caught by hand. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (cause) {
		return cause;
	}
	throw new Error("expected a rejection");
}

/** Every threaded producer offers a plain send; the type keeps it optional for transactional clients. */
function senderOf(producer: {
	send?: KafkaProducerClient["send"];
}): NonNullable<KafkaProducerClient["send"]> {
	if (!producer.send) throw new Error("producer offers no send");
	return producer.send;
}

function echoOf(metadata: { logAppendTime?: string }[]): Echo {
	return JSON.parse(metadata[0]?.logAppendTime ?? "{}") as Echo;
}

async function withThread<T>({
	onFatal = noFatal,
	sendRingBytes,
	run,
}: {
	onFatal?: (failure: { cause: unknown }) => void;
	sendRingBytes?: number;
	run: (remote: ReturnType<typeof createThreadedProducers>) => Promise<T>;
}): Promise<T> {
	const remote = createThreadedProducers({
		ctx: { logger, onFatal },
		config: {
			...clientConfig,
			threadUrl,
			sendRingBytes: sendRingBytes ?? 4 << 20,
			ackRingBytes: 1 << 20,
		},
	});
	await remote.start();
	try {
		return await run(remote);
	} finally {
		await remote.stop();
	}
}

describe("threaded producers", () => {
	test("SCRAM credentials reach the producer thread, so its client signs in like the decide thread's", async () => {
		const remote = createThreadedProducers({
			ctx: { logger, onFatal: noFatal },
			config: {
				...clientConfig,
				clientId: "scram-client",
				authMode: "scram",
				scram: {
					mechanism: "scram-sha-256",
					username: "balance-worker",
					password: "test-password",
				},
				threadUrl,
				sendRingBytes: 4 << 20,
				ackRingBytes: 1 << 20,
			},
		});
		await remote.start();
		await remote.stop();
	});

	test("request ids wrap within u32, so sends past 2^32 requests still find their acks", async () => {
		let scope: ThreadedProducersScope | undefined;
		const original = threadProducer.createThreadProducer;
		const captured = spyOn(
			threadProducer,
			"createThreadProducer",
		).mockImplementation((args) => {
			scope = args.scope;
			return original(args);
		});
		try {
			await withThread({
				run: async (remote) => {
					const producer = remote.producer({ idempotent: true });
					await producer.connect();
					if (!scope) throw new Error("scope not captured");
					scope.state.nextReqId = 0xfffffffe;
					const record = {
						topic: "echo",
						messages: [{ key: "k", value: "v", partition: 0 }],
					};
					for (let sent = 0; sent < 3; sent++) {
						const outcome = await Promise.race([
							senderOf(producer)(record).then(() => "acked"),
							Bun.sleep(1000).then(() => "hung"),
						]);
						expect(outcome).toBe("acked");
					}
					expect(scope.state.nextReqId).toBe(3);
					await producer.disconnect();
				},
			});
		} finally {
			captured.mockRestore();
		}
	});

	test("a producer's config, record bytes, partition, headers, acks and compression reach the producer thread unchanged", async () => {
		await withThread({
			run: async (remote) => {
				const producer = remote.producer({
					idempotent: true,
					maxInFlightRequests: 2,
					retry: { retries: 3, initialRetryTime: 5, maxRetryTime: 50 },
					createPartitioner: () => () => 0,
				});
				await producer.connect();
				const headers = { ownerEpoch: "12" };
				const metadata = await senderOf(producer)({
					topic: "echo",
					acks: -1,
					compression: CompressionTypes.GZIP,
					messages: [
						{
							key: Buffer.from("k1"),
							value: Buffer.from("v1"),
							partition: 3,
							headers,
						},
						{
							key: Buffer.from("k2"),
							value: Buffer.from("v2"),
							partition: 3,
							headers,
						},
					],
				});
				const echo = echoOf(metadata);
				expect(echo.config).toEqual({
					idempotent: true,
					maxInFlightRequests: 2,
					retry: { retries: 3, initialRetryTime: 5, maxRetryTime: 50 },
					createPartitioner: "function",
				});
				expect(echo.acks).toBe(-1);
				expect(echo.compression).toBe(CompressionTypes.GZIP);
				expect(echo.messages).toEqual([
					{ key: "k1", value: "v1", partition: 3, headers },
					{ key: "k2", value: "v2", partition: 3, headers },
				]);
				await producer.disconnect();
			},
		});
	});

	test("messages with their own partitions and headers, string keys and null values cross as they are", async () => {
		await withThread({
			run: async (remote) => {
				const producer = remote.producer({ idempotent: true });
				await producer.connect();
				const metadata = await senderOf(producer)({
					topic: "echo",
					messages: [
						{ key: "a", value: null, partition: 1, headers: { x: "1" } },
						{ key: null, value: Buffer.from("b"), partition: 2 },
					],
				});
				expect(echoOf(metadata).messages).toEqual([
					{ key: "a", value: null, partition: 1, headers: { x: "1" } },
					{ key: null, value: "b", partition: 2 },
				]);
			},
		});
	});

	test("a broker refusal comes back as a KafkaJSProtocolError, so the batch is known to be uncommitted", async () => {
		await withThread({
			run: async (remote) => {
				const producer = remote.producer({ idempotent: true });
				await producer.connect();
				let caught: unknown;
				try {
					await sendIdempotentBatch({
						sender: { send: senderOf(producer) },
						topic: "refuse",
						partition: 0,
						messages: [{ key: Buffer.from("k"), value: Buffer.from("v") }],
						ownerEpoch: "1",
					});
				} catch (cause) {
					caught = cause;
				}
				expect(caught).toBeInstanceOf(KafkaBatchNotCommittedError);
				const cause = (caught as KafkaBatchNotCommittedError)
					.cause as KafkaJSProtocolError;
				expect(cause).toBeInstanceOf(KafkaJSProtocolError);
				expect(cause.type).toBe("INVALID_TOPIC_EXCEPTION");
				expect(cause.code).toBe(17);
				expect(cause.retriable).toBe(false);
			},
		});
	});

	test("retries exhausted come back as a KafkaJSError whose cause still names the fencing code", async () => {
		await withThread({
			run: async (remote) => {
				const producer = remote.producer({ idempotent: true });
				await producer.connect();
				let caught: unknown;
				try {
					await sendIdempotentBatch({
						sender: { send: senderOf(producer) },
						topic: "fenced",
						partition: 0,
						messages: [{ key: Buffer.from("k"), value: Buffer.from("v") }],
						ownerEpoch: "1",
					});
				} catch (cause) {
					caught = cause;
				}
				expect(caught).toBeInstanceOf(KafkaTransactionStateUnknownError);
				const cause = (caught as KafkaTransactionStateUnknownError)
					.cause as Error;
				expect(cause).toBeInstanceOf(KafkaJSError);
				expect(cause).not.toBeInstanceOf(KafkaJSProtocolError);
				expect(cause.name).toBe("KafkaJSNumberOfRetriesExceeded");
				expect(isKafkaProducerFencingCause({ cause })).toBe(true);
			},
		});
	});

	test("retries exhausted in a leader election cross the thread as an unknown append that parks only its partition", async () => {
		await withThread({
			run: async (remote) => {
				const producer = remote.producer({ idempotent: true });
				await producer.connect();
				const caught = await rejectionOf(
					sendIdempotentBatch({
						sender: { send: senderOf(producer) },
						topic: "electing",
						partition: 0,
						messages: [{ key: Buffer.from("k"), value: Buffer.from("v") }],
						ownerEpoch: "1",
					}),
				);
				expect(caught).toBeInstanceOf(KafkaTransactionStateUnknownError);
				expect(((caught as Error).cause as Error).name).toBe(
					"KafkaJSNumberOfRetriesExceeded",
				);
				const recovery = new OwnedPartitionRecoveryRequiredError({
					topic: "electing",
					partition: 0,
					cause: new PartitionWriterRecoveryRequiredError({ cause: caught }),
				});
				expect(isPartitionRestartableCause({ cause: recovery })).toBe(true);
			},
		});
	});

	test("broker request timings reach a producer session's onRequest, as the in-thread client's do", async () => {
		await withThread({
			run: async (remote) => {
				const timings: {
					apiName: string;
					broker: string;
					durationMs: number;
					pendingMs: number;
				}[] = [];
				const session = createProducerSession({
					ctx: { kafka: remote, onRequest: (timing) => timings.push(timing) },
					config: {
						transactionalId: "unused",
						mode: "idempotent",
						limits: {
							retryCount: 1,
							initialRetryTimeMs: 1,
							maxRetryTimeMs: 1,
							transactionTimeoutMs: 1000,
						},
					},
				});
				await session.connect();
				await session.fence();
				await session.send({
					topic: "t",
					messages: [{ key: "k", value: "v", partition: 0 }],
				});
				const deadline = Date.now() + 1000;
				while (timings.length === 0 && Date.now() < deadline)
					await Bun.sleep(5);
				expect(timings).toEqual([
					{
						apiName: "Produce",
						broker: "fake:9092",
						durationMs: 3,
						pendingMs: 1,
					},
				]);
				await session.disconnect();
			},
		});
	});

	test("sends keep their order per producer even when the ring is full and payloads take the message port, which the window counts", async () => {
		await withThread({
			sendRingBytes: 4096,
			run: async (remote) => {
				const producer = remote.producer({ idempotent: true });
				await producer.connect();
				const value = Buffer.alloc(900, 1);
				const replies = await Promise.all(
					Array.from({ length: 50 }, (_, i) =>
						senderOf(producer)({
							topic: "ordered",
							messages: [{ key: Buffer.from(String(i)), value, partition: 0 }],
						}),
					),
				);
				expect(replies.map((metadata) => metadata[0]?.baseOffset)).toEqual(
					Array.from({ length: 50 }, (_, i) => String(i)),
				);
				const window = remote.drainHealth();
				expect(window.sendsOverPort).toBeGreaterThan(0);
				expect(window.sendsAwaitingAck).toBe(0);
				expect(remote.drainHealth().sendsOverPort).toBe(0);
			},
		});
	});

	test("a connect the broker refuses rejects the caller with the thread's error", async () => {
		await withThread({
			run: async (remote) => {
				const producer = remote.producer({ transactionalId: "refuse-connect" });
				const caught = (await rejectionOf(producer.connect())) as Error;
				expect(caught.message).toContain("connection refused");
			},
		});
	});

	test("a producer thread that cannot start fails start() instead of hanging", async () => {
		const remote = createThreadedProducers({
			ctx: { logger, onFatal: noFatal },
			config: {
				...clientConfig,
				clientId: "bad-client",
				threadUrl,
				sendRingBytes: 1 << 16,
				ackRingBytes: 1 << 16,
			},
		});
		const caught = (await rejectionOf(remote.start())) as Error;
		expect(caught.message).toContain("bad client id");
	});

	test("the producer thread dying is fatal once and fails every send in flight as an unknown outcome", async () => {
		const causes: string[] = [];
		await withThread({
			onFatal: ({ cause }) => causes.push(String(cause)),
			run: async (remote) => {
				const producer = remote.producer({ idempotent: true });
				await producer.connect();
				let caught: unknown;
				try {
					await senderOf(producer)({
						topic: "crash",
						messages: [{ key: "k", value: "v", partition: 0 }],
					});
				} catch (cause) {
					caught = cause;
				}
				expect(caught).toBeInstanceOf(KafkaJSError);
				expect(caught).not.toBeInstanceOf(KafkaJSProtocolError);
				expect(causes).toHaveLength(1);
				expect(causes[0]).toContain("Producer thread exited with code 7");
				const later = (await rejectionOf(
					senderOf(producer)({
						topic: "t",
						messages: [{ key: "k", value: "v" }],
					}),
				)) as Error;
				expect(later.message).toContain("Producer thread failed");
			},
		});
	});

	test("a send after disconnect rejects at once as disconnected, and one racing the disconnect is answered rather than left pending", async () => {
		await withThread({
			sendRingBytes: 4096,
			run: async (remote) => {
				const producer = remote.producer({ idempotent: true });
				await producer.connect();
				const record = {
					topic: "t",
					messages: [{ key: "k", value: Buffer.alloc(900, 1), partition: 0 }],
				};
				// Enough sends to leave some waiting on the message port when the disconnect lands.
				const racing = Array.from({ length: 12 }, () =>
					senderOf(producer)(record).then(
						() => "ok",
						(cause: Error) => `rejected: ${cause.message}`,
					),
				);
				const disconnected = producer.disconnect();
				const late = (await rejectionOf(senderOf(producer)(record))) as Error;
				expect(late).toBeInstanceOf(KafkaJSError);
				expect(late.message).toBe("The producer is disconnected");
				await disconnected;
				const outcomes = await Promise.race([
					Promise.all(racing),
					Bun.sleep(2_000).then(() => "TIMEOUT" as const),
				]);
				expect(outcomes).not.toBe("TIMEOUT");
				for (const outcome of outcomes as string[])
					expect(outcome === "ok" || outcome.startsWith("rejected:")).toBe(
						true,
					);
			},
		});
	});

	test("a producer cannot be created before the thread is started, and transactions are refused", async () => {
		const remote = createThreadedProducers({
			ctx: { logger, onFatal: noFatal },
			config: {
				...clientConfig,
				threadUrl,
				sendRingBytes: 1 << 16,
				ackRingBytes: 1 << 16,
			},
		});
		expect(() => remote.producer({ idempotent: true })).toThrow("started");
		await withThread({
			run: async (started) => {
				const producer = started.producer({ idempotent: true });
				const caught = (await rejectionOf(producer.transaction())) as Error;
				expect(caught.message).toContain("no transactions");
			},
		});
	});
});
