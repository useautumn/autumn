import { describe, expect, test } from "bun:test";
import type { KafkaProducerClient } from "@autumn/kafka";
import {
	KafkaJSProtocolError,
	type ProducerConfig,
	type ProducerRecord,
	type RecordMetadata,
} from "kafkajs";
import {
	ACK_FRAME,
	decodeAckFrame,
	type SendAck,
} from "../../../../src/kafka/producerThread/frames/ackFrame.js";
import {
	encodeSendMeta,
	SEND_FRAME,
	type SendMeta,
	sendFrameLength,
	writeSendFrame,
} from "../../../../src/kafka/producerThread/frames/sendFrame.js";
import { sendFrameOf } from "../../../../src/kafka/producerThread/rules/sendFrameOf.js";
import { startProducerLoop } from "../../../../src/kafka/producerThread/startProducerLoop.js";
import type { ProducerToDecideMessage } from "../../../../src/kafka/producerThread/types/producerThreadMessages.js";
import {
	createRing,
	createRingReader,
	createRingWriter,
} from "../../../../src/threads/ring/createRing.js";
import { createRingSignal } from "../../../../src/threads/ring/ringSignal.js";

const decoder = new TextDecoder();

type Sent = { config: ProducerConfig; record: ProducerRecord };

/** The producer loop on this thread with a scripted client: topic "refuse" is a broker refusal, "hang" never settles. */
function loopHarness() {
	const sent: Sent[] = [];
	const posted: ProducerToDecideMessage[] = [];
	const connected = new Set<ProducerConfig>();
	const sendRing = createRing({ capacity: 1 << 16 });
	const ackRing = createRing({ capacity: 1 << 16 });
	const sendSignal = createRingSignal();
	const ackSignal = createRingSignal();
	const sends = createRingWriter({ ring: sendRing, signal: sendSignal });
	const acks = createRingReader({ ring: ackRing });
	const received: { reqId: number; ack: SendAck }[] = [];

	function producer(config: ProducerConfig): KafkaProducerClient {
		return {
			async connect() {
				if (config.transactionalId === "refuse-connect")
					throw new Error("connection refused");
				connected.add(config);
			},
			async disconnect() {
				connected.delete(config);
			},
			async send(record: ProducerRecord): Promise<RecordMetadata[]> {
				sent.push({ config, record });
				if (record.topic === "hang") return new Promise(() => {});
				if (record.topic === "refuse")
					throw new KafkaJSProtocolError(
						Object.assign(new Error("invalid topic"), {
							type: "INVALID_TOPIC_EXCEPTION",
							code: 17,
							retriable: false,
						}),
					);
				return [
					{
						topicName: record.topic,
						partition: record.messages[0]?.partition ?? 0,
						errorCode: 0,
						baseOffset: String(sent.length - 1),
					},
				];
			},
			transaction: () => Promise.reject(new Error("no transactions")),
		};
	}

	const loop = startProducerLoop({
		ctx: { kafka: { producer }, post: (message) => posted.push(message) },
		init: {
			clientId: "test",
			brokers: ["fake:9092"],
			authMode: "none",
			limits: {
				connectionTimeoutMs: 1,
				requestTimeoutMs: 1,
				retryCount: 1,
				initialRetryTimeMs: 1,
				maxRetryTimeMs: 1,
			},
			sendRing,
			ackRing,
			sendSignal: sendSignal.sab,
			ackSignal: ackSignal.sab,
		},
	});

	/** Through the decide thread's own encoding, so the loop is tested on the frames it will really get. */
	function frameOf({
		reqId,
		meta: { producerId, seq, topic, acks, shared },
		values,
	}: {
		reqId: number;
		meta: Omit<SendMeta, "count">;
		values: (string | null)[];
	}): Uint8Array {
		const { meta, records } = sendFrameOf({
			producerId,
			seq,
			record: {
				topic,
				acks,
				messages: values.map((value) => ({
					key: `k${reqId}`,
					value,
					...shared,
				})),
			},
		});
		const metaBytes = encodeSendMeta({ meta });
		const bytes = new Uint8Array(sendFrameLength({ metaBytes, records }));
		writeSendFrame({ bytes, at: 0, reqId, metaBytes, records });
		return bytes;
	}

	function viaRing(frame: Uint8Array): void {
		expect(sends.write({ type: SEND_FRAME, payload: frame })).toBe(true);
		sends.flush();
	}

	function viaPort(frame: Uint8Array): void {
		loop.receive({ kind: "send", bytes: frame.slice().buffer });
	}

	async function acksFor(count: number): Promise<typeof received> {
		for (let spins = 0; received.length < count; spins++) {
			if (spins > 500) throw new Error(`only ${received.length} acks`);
			for (;;) {
				const frame = acks.next();
				if (!frame) break;
				expect(frame.type).toBe(ACK_FRAME);
				received.push(decodeAckFrame({ bytes: frame.bytes }));
				acks.advance();
			}
			acks.release();
			await Bun.sleep(1);
		}
		return received;
	}

	async function postedOf(kind: ProducerToDecideMessage["kind"]) {
		for (let spins = 0; spins < 500; spins++) {
			const found = posted.filter((message) => message.kind === kind);
			if (found.length > 0) return found;
			await Bun.sleep(1);
		}
		throw new Error(`nothing posted of kind ${kind}`);
	}

	async function open({
		producerId,
		config = { idempotent: true },
	}: {
		producerId: number;
		config?: ProducerConfig & { explicitPartitioner?: boolean };
	}): Promise<void> {
		loop.receive({
			kind: "create",
			producerId,
			config: { explicitPartitioner: false, ...config },
		});
		loop.receive({ kind: "connect", producerId, reqId: 1000 + producerId });
		await postedOf("done");
	}

	return {
		loop,
		sent,
		posted,
		connected,
		frameOf,
		viaRing,
		viaPort,
		acksFor,
		postedOf,
		open,
	};
}

describe("producer loop", () => {
	test("a send frame becomes one producer.send with its record rebuilt, and the broker's metadata comes back as its ack", async () => {
		const h = loopHarness();
		await h.open({ producerId: 1 });
		h.viaRing(
			h.frameOf({
				reqId: 7,
				meta: {
					producerId: 1,
					seq: 0,
					topic: "outcomes",
					acks: -1,
					shared: { partition: 3, headers: { source: "test" } },
				},
				values: ["a", null],
			}),
		);
		const [ack] = await h.acksFor(1);
		expect(ack).toEqual({
			reqId: 7,
			ack: {
				ok: true,
				metadata: [
					{
						topicName: "outcomes",
						partition: 3,
						errorCode: 0,
						baseOffset: "0",
					},
				],
			},
		});
		const record = h.sent[0]?.record as ProducerRecord;
		expect(record.topic).toBe("outcomes");
		expect(record.acks).toBe(-1);
		expect(
			record.messages.map((message) => ({
				key: decoder.decode(message.key as Buffer),
				value:
					message.value === null
						? null
						: decoder.decode(message.value as Buffer),
				partition: message.partition,
				headers: message.headers,
			})),
		).toEqual([
			{ key: "k7", value: "a", partition: 3, headers: { source: "test" } },
			{ key: "k7", value: null, partition: 3, headers: { source: "test" } },
		]);
		h.loop.receive({ kind: "stop" });
	});

	test("a frame that overtook its predecessor by the message port waits for it, so each producer's sends keep their order", async () => {
		const h = loopHarness();
		await h.open({ producerId: 1 });
		const meta = { producerId: 1, topic: "outcomes" };
		h.viaPort(
			h.frameOf({ reqId: 2, meta: { ...meta, seq: 1 }, values: ["second"] }),
		);
		await Bun.sleep(5);
		expect(h.sent).toEqual([]);
		h.viaRing(
			h.frameOf({ reqId: 1, meta: { ...meta, seq: 0 }, values: ["first"] }),
		);
		await h.acksFor(2);
		expect(
			h.sent.map(({ record }) =>
				decoder.decode(record.messages[0]?.value as Buffer),
			),
		).toEqual(["first", "second"]);
		h.loop.receive({ kind: "stop" });
	});

	test("a broker refusal is acked as a protocol error, so the decide thread knows nothing was appended", async () => {
		const h = loopHarness();
		await h.open({ producerId: 1 });
		h.viaRing(
			h.frameOf({
				reqId: 4,
				meta: { producerId: 1, seq: 0, topic: "refuse" },
				values: ["x"],
			}),
		);
		const [ack] = await h.acksFor(1);
		expect(ack?.ack).toMatchObject({
			ok: false,
			error: { kind: "protocol", type: "INVALID_TOPIC_EXCEPTION", code: 17 },
		});
		h.loop.receive({ kind: "stop" });
	});

	test("a disconnect answers the frames still waiting for their turn, and later sends for that producer are answered disconnected", async () => {
		const h = loopHarness();
		await h.open({ producerId: 1 });
		const meta = { producerId: 1, topic: "outcomes" };
		h.viaPort(
			h.frameOf({ reqId: 5, meta: { ...meta, seq: 1 }, values: ["held"] }),
		);
		h.loop.receive({ kind: "disconnect", producerId: 1, reqId: 6 });
		h.viaRing(
			h.frameOf({ reqId: 8, meta: { ...meta, seq: 0 }, values: ["late"] }),
		);
		const acks = await h.acksFor(2);
		expect(acks.map(({ reqId }) => reqId).sort()).toEqual([5, 8]);
		for (const { ack } of acks)
			expect(ack).toMatchObject({
				ok: false,
				error: {
					kind: "other",
					message: expect.stringContaining("disconnected"),
				},
			});
		expect(h.sent).toEqual([]);
		expect(await h.postedOf("done")).toContainEqual({ kind: "done", reqId: 6 });
		h.loop.receive({ kind: "stop" });
	});

	test("a connect the broker refuses is answered failed with the client's error", async () => {
		const h = loopHarness();
		h.loop.receive({
			kind: "create",
			producerId: 2,
			config: { transactionalId: "refuse-connect", explicitPartitioner: false },
		});
		h.loop.receive({ kind: "connect", producerId: 2, reqId: 9 });
		const [failed] = await h.postedOf("failed");
		expect(failed).toMatchObject({
			kind: "failed",
			reqId: 9,
			error: { message: "connection refused" },
		});
		h.loop.receive({ kind: "stop" });
	});

	test("stop disconnects every producer, even with a send still in flight, then reports stopped", async () => {
		const h = loopHarness();
		await h.open({ producerId: 1 });
		await h.open({ producerId: 2 });
		h.viaRing(
			h.frameOf({
				reqId: 3,
				meta: { producerId: 1, seq: 0, topic: "hang" },
				values: ["x"],
			}),
		);
		while (h.sent.length === 0) await Bun.sleep(1);
		expect(h.connected.size).toBe(2);
		h.loop.receive({ kind: "stop" });
		expect(await h.postedOf("stopped")).toEqual([{ kind: "stopped" }]);
		expect(h.connected.size).toBe(0);
	});
});
