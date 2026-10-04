/**
 * The Kafka worker's loop: the kafkajs producers live here, on their own thread. SEND payloads come off
 * the send ring (or by `postMessage` when they did not fit), each becomes one `producer.send`, and its
 * outcome goes back as an ACK frame. Control messages create, connect and disconnect producers.
 * Nothing here knows a record's meaning; it moves bytes and reports what the broker said.
 */

import type { KafkaProducerClient, KafkaProducerFactory } from "@autumn/kafka";
import { explicitPartitioner } from "@autumn/kafka";
import type { ProducerConfig, ProducerRecord } from "kafkajs";
import { laneErrorOf } from "./laneErrors.js";
import {
	encodeAck,
	type KafkaToMainMessage,
	type KafkaWorkerInit,
	LANE,
	type MainToKafkaMessage,
	type ProducerConfigSnapshot,
	readSend,
	type SendAck,
	type SendMeta,
} from "./laneProtocol.js";
import { Doorbell, RingConsumer, RingProducer } from "./ring.js";

export type KafkaWorkerLoop = {
	onMessage(message: MainToKafkaMessage): void;
	/** Settles once a stop has disconnected every producer and the loop has ended. */
	stopped: Promise<void>;
};

export function startKafkaWorker({
	ctx,
	init,
}: {
	ctx: {
		kafka: KafkaProducerFactory;
		post(message: KafkaToMainMessage): void;
	};
	init: KafkaWorkerInit;
}): KafkaWorkerLoop {
	const sends = new RingConsumer(init.sendRing);
	const sendBell = new Doorbell(init.sendBell);
	const acks = new RingProducer(init.ackRing, new Doorbell(init.ackBell));
	const producers = new Map<number, KafkaProducerClient>();
	// A payload that took the message port can overtake the ring; sends are dispatched in the producer's order.
	const nextSeq = new Map<number, number>();
	const held = new Map<number, Map<number, Uint8Array>>();
	const ackQueue: Uint8Array[] = [];
	let ackPump: Promise<void> | null = null;
	let stopping = false;
	const stoppedSignal = Promise.withResolvers<void>();

	function producerOf({ snapshot }: { snapshot: ProducerConfigSnapshot }) {
		const { explicitPartitioner: explicit, ...config } = snapshot;
		const producerConfig: ProducerConfig = explicit
			? { ...config, createPartitioner: explicitPartitioner }
			: config;
		return ctx.kafka.producer(producerConfig);
	}

	function create({
		producerId,
		config,
	}: {
		producerId: number;
		config: ProducerConfigSnapshot;
	}): void {
		const producer = producerOf({ snapshot: config });
		producers.set(producerId, producer);
		if (!producer.on || !producer.events) return;
		producer.on(producer.events.REQUEST, ({ payload }) => {
			ctx.post({
				kind: "request",
				event: {
					producerId,
					apiName: payload.apiName,
					broker: payload.broker,
					durationMs: payload.duration,
					pendingMs: payload.pendingDuration,
				},
			});
		});
	}

	function settle({
		reqId,
		work,
	}: {
		reqId: number;
		work: Promise<void>;
	}): void {
		work.then(
			() => ctx.post({ kind: "done", reqId }),
			(cause) =>
				ctx.post({ kind: "failed", reqId, error: laneErrorOf({ cause }) }),
		);
	}

	function recordOf({
		meta,
		records,
	}: {
		meta: SendMeta;
		records: { key: Buffer | null; value: Buffer | null }[];
	}): ProducerRecord {
		const messages = records.map((record, index) => ({
			key: record.key,
			value: record.value,
			...(meta.messages ? meta.messages[index] : meta.shared),
		}));
		return {
			topic: meta.topic,
			messages,
			...(meta.acks !== undefined && { acks: meta.acks }),
			...(meta.compression !== undefined && { compression: meta.compression }),
			...(meta.timeout !== undefined && { timeout: meta.timeout }),
		};
	}

	async function pumpAcks(): Promise<void> {
		// Yields first, so the pump handle is set before the queue drains and cleared only after.
		await undefined;
		try {
			// Acks leave in the order their sends settled; a full ring means the main thread is behind, so wait a turn.
			let waits = 0;
			while (ackQueue.length > 0) {
				const next = ackQueue[0] as Uint8Array;
				if (acks.write({ type: LANE.ACK, payload: next })) {
					ackQueue.shift();
					waits = 0;
					continue;
				}
				acks.flush();
				waits++;
				await Bun.sleep(waits < 10 ? 1 : 5);
			}
			acks.flush();
		} finally {
			ackPump = null;
		}
	}

	function ack({ reqId, ack: outcome }: { reqId: number; ack: SendAck }): void {
		ackQueue.push(encodeAck({ reqId, ack: outcome }));
		ackPump ??= pumpAcks();
	}

	function noProducerAck({
		reqId,
		producerId,
	}: {
		reqId: number;
		producerId: number;
	}): void {
		ack({
			reqId,
			ack: {
				ok: false,
				error: {
					kind: "other",
					name: "KafkaJSError",
					message: `The producer is disconnected (no producer ${producerId} on the Kafka worker)`,
					retriable: false,
				},
			},
		});
	}

	function dispatch({ bytes }: { bytes: Uint8Array }): void {
		const { reqId, meta, records } = readSend({ bytes });
		// A send that reaches the worker after its producer's disconnect is answered, never held.
		if (!producers.has(meta.producerId)) {
			noProducerAck({ reqId, producerId: meta.producerId });
			return;
		}
		const expected = nextSeq.get(meta.producerId) ?? 0;
		if (meta.seq !== expected) {
			let waiting = held.get(meta.producerId);
			if (!waiting) {
				waiting = new Map();
				held.set(meta.producerId, waiting);
			}
			waiting.set(meta.seq, bytes);
			return;
		}
		nextSeq.set(meta.producerId, expected + 1);
		send({ reqId, meta, records });
		const next = held.get(meta.producerId)?.get(expected + 1);
		if (next) {
			held.get(meta.producerId)?.delete(expected + 1);
			dispatch({ bytes: next });
		}
	}

	function send({
		reqId,
		meta,
		records,
	}: {
		reqId: number;
		meta: SendMeta;
		records: { key: Buffer | null; value: Buffer | null }[];
	}): void {
		const producer = producers.get(meta.producerId);
		if (!producer?.send) {
			noProducerAck({ reqId, producerId: meta.producerId });
			return;
		}
		producer.send(recordOf({ meta, records })).then(
			(metadata) => ack({ reqId, ack: { ok: true, metadata } }),
			(cause) =>
				ack({ reqId, ack: { ok: false, error: laneErrorOf({ cause }) } }),
		);
	}

	function drainSends(): number {
		let n = 0;
		for (;;) {
			const frame = sends.next();
			if (!frame) break;
			if (frame.type !== LANE.SEND)
				throw new Error(`Kafka worker: unexpected frame ${frame.type}`);
			// A copy: a held payload must outlive the ring slot, which is reused once we advance.
			const payload = frame.bytes.slice();
			sends.advance();
			n++;
			dispatch({ bytes: payload });
		}
		if (n > 0) sends.release();
		return n;
	}

	async function sendLoop(): Promise<void> {
		while (!stopping) {
			if (drainSends() > 0) continue;
			await sendBell.sleep({ hasWork: () => sends.hasWork(), timeoutMs: 50 });
		}
	}

	async function stop(): Promise<void> {
		stopping = true;
		await Promise.allSettled(
			[...producers.values()].map((producer) => producer.disconnect()),
		);
		producers.clear();
		if (ackPump) await ackPump;
		stoppedSignal.resolve();
		ctx.post({ kind: "stopped" });
	}

	function onMessage(message: MainToKafkaMessage): void {
		switch (message.kind) {
			case "create":
				create({ producerId: message.producerId, config: message.config });
				return;
			case "connect": {
				const producer = producers.get(message.producerId);
				settle({
					reqId: message.reqId,
					work: producer
						? producer.connect()
						: Promise.reject(
								new Error(`Kafka worker: no producer ${message.producerId}`),
							),
				});
				return;
			}
			case "disconnect": {
				const producer = producers.get(message.producerId);
				producers.delete(message.producerId);
				nextSeq.delete(message.producerId);
				// Payloads still waiting for an earlier sequence number will never see it: answer them now.
				for (const bytes of held.get(message.producerId)?.values() ?? []) {
					const { reqId } = readSend({ bytes });
					noProducerAck({ reqId, producerId: message.producerId });
				}
				held.delete(message.producerId);
				settle({
					reqId: message.reqId,
					work: producer ? producer.disconnect() : Promise.resolve(),
				});
				return;
			}
			case "send":
				dispatch({ bytes: new Uint8Array(message.bytes) });
				return;
			case "stop":
				void stop();
				return;
		}
	}

	// A frame the loop cannot read ends the loop; the worker's uncaught rejection reaches the main thread as its error.
	void sendLoop();
	return { onMessage, stopped: stoppedSignal.promise };
}
