/**
 * The main thread's handle on the Kafka worker: a `kafka.producer(config)` factory whose producers live on
 * the worker thread. A send is one SEND payload on the send ring (or a `postMessage` when it does not fit),
 * its outcome one ACK frame back; connect and disconnect are control messages. The producers the writer
 * sees keep kafkajs's contract: `RecordMetadata[]` on success, a `KafkaJSProtocolError` when the broker
 * refused and a `KafkaJSError` for every failure whose fate is unknown.
 */
import type {
	KafkaProducerClient,
	KafkaProducerFactory,
	KafkaTokenInfo,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import {
	KafkaJSError,
	type Producer,
	type ProducerConfig,
	type RecordMetadata,
} from "kafkajs";
import { laneErrorToKafkaError } from "./laneErrors.js";
import {
	decodeAck,
	encodeSendMeta,
	type KafkaRequestEvent,
	type KafkaToMainMessage,
	type KafkaWorkerInit,
	LANE,
	type LaneRecord,
	type MainToKafkaMessage,
	type ProducerConfigSnapshot,
	type SendAck,
	type SendMessageMeta,
	type SendMeta,
	sendByteLength,
	writeSend,
} from "./laneProtocol.js";
import { allocateRing, Doorbell, RingConsumer, RingProducer } from "./ring.js";

export type RemoteKafkaProducersConfig = Pick<
	KafkaWorkerInit,
	"clientId" | "brokers" | "authMode" | "region" | "limits"
> & {
	/** Both must be powers of two. Defaults: 8 MiB of sends, 1 MiB of acks. */
	sendRingBytes?: number;
	ackRingBytes?: number;
	/** The worker module; tests point it at a worker that fakes the broker. */
	workerUrl?: string;
};

export type RemoteKafkaProducers = KafkaProducerFactory & {
	/** Resolves once the worker thread has built its client. Producers can only be created after this. */
	start(): Promise<void>;
	/** Disconnects every producer still open and ends the thread. */
	stop(): Promise<void>;
	readStats(): Record<string, number>;
};

type Pending = { resolve(ack: SendAck): void };
type RequestListener = (event: {
	payload: Producer["events"] extends never ? never : KafkaRequestEventPayload;
}) => void;
type KafkaRequestEventPayload = {
	apiName: string;
	broker: string;
	duration: number;
	pendingDuration: number;
};

const PRODUCER_EVENTS = { REQUEST: "producer.network.request" } as const;
const encoder = new TextEncoder();

export function createRemoteKafkaProducers({
	ctx,
	config,
}: {
	ctx: {
		logger: Pick<AutumnLogger, "info" | "warn" | "error">;
		/** The worker thread died or the lane broke: nothing in flight can be trusted, so the task must be replaced. */
		onFatal(failure: { cause: unknown }): void;
		onToken?(info: KafkaTokenInfo): void;
	};
	config: RemoteKafkaProducersConfig;
}): RemoteKafkaProducers {
	const sendRing = allocateRing({ capacity: config.sendRingBytes ?? 8 << 20 });
	const ackRing = allocateRing({ capacity: config.ackRingBytes ?? 1 << 20 });
	const sendBell = new Doorbell();
	const ackBell = new Doorbell();
	const sends = new RingProducer(sendRing, sendBell);
	const acks = new RingConsumer(ackRing);
	const pending = new Map<number, Pending>();
	const requestListeners = new Map<number, Set<RequestListener>>();
	const stats = { sends: 0, sendsByPost: 0, acks: 0, controls: 0 };
	let worker: Worker | null = null;
	let nextReqId = 1;
	let nextProducerId = 1;
	let stopping = false;
	let failed = false;
	let stopped: ReturnType<typeof Promise.withResolvers<void>> | null = null;

	function fatal({ cause }: { cause: unknown }): void {
		if (failed || stopping) return;
		failed = true;
		ctx.logger.error(
			{ error: cause },
			"Kafka worker failed; the task must be replaced",
		);
		// Nothing in flight will be answered: fail it as an unknown outcome, which is what it is.
		for (const [reqId, waiting] of pending) {
			pending.delete(reqId);
			waiting.resolve({
				ok: false,
				error: {
					kind: "other",
					name: "KafkaJSError",
					message: `Kafka worker failed: ${String((cause as Error)?.message ?? cause)}`,
					retriable: false,
				},
			});
		}
		ctx.onFatal({ cause });
	}

	function post(message: MainToKafkaMessage, transfer?: Transferable[]): void {
		if (!worker) throw new Error("Remote Kafka producers are not started");
		worker.postMessage(message, transfer ?? []);
	}

	function awaitAck({ reqId }: { reqId: number }): Promise<SendAck> {
		return new Promise<SendAck>((resolve) => {
			pending.set(reqId, { resolve });
		});
	}

	function settle({ reqId, ack }: { reqId: number; ack: SendAck }): void {
		const waiting = pending.get(reqId);
		if (!waiting) {
			ctx.logger.warn(`Kafka worker answered an unknown request ${reqId}`);
			return;
		}
		pending.delete(reqId);
		waiting.resolve(ack);
	}

	async function control(
		message: MainToKafkaMessage & { reqId: number },
	): Promise<void> {
		stats.controls++;
		const settled = awaitAck({ reqId: message.reqId });
		post(message);
		const ack = await settled;
		if (!ack.ok) throw laneErrorToKafkaError({ error: ack.error });
	}

	function onRequestEvent({ event }: { event: KafkaRequestEvent }): void {
		const listeners = requestListeners.get(event.producerId);
		if (!listeners) return;
		const payload: KafkaRequestEventPayload = {
			apiName: event.apiName,
			broker: event.broker,
			duration: event.durationMs,
			pendingDuration: event.pendingMs,
		};
		for (const listener of listeners) listener({ payload });
	}

	function drainAcks(): number {
		let n = 0;
		for (;;) {
			const frame = acks.next();
			if (!frame) break;
			if (frame.type !== LANE.ACK)
				throw new Error(`Kafka lane: unexpected frame ${frame.type}`);
			const { reqId, ack } = decodeAck({ bytes: frame.bytes });
			acks.advance();
			n++;
			stats.acks++;
			settle({ reqId, ack });
		}
		if (n > 0) acks.release();
		return n;
	}

	async function ackLoop(): Promise<void> {
		while (!stopping && !failed) {
			if (drainAcks() > 0) continue;
			await ackBell.sleep({ hasWork: () => acks.hasWork(), timeoutMs: 20 });
		}
	}

	function onWorkerMessage({ message }: { message: KafkaToMainMessage }): void {
		switch (message.kind) {
			case "ready":
			case "error":
				// Settled by start(); a second one is a worker bug worth nothing more than ignoring.
				return;
			case "done":
				settle({ reqId: message.reqId, ack: { ok: true, metadata: [] } });
				return;
			case "failed":
				settle({
					reqId: message.reqId,
					ack: { ok: false, error: message.error },
				});
				return;
			case "request":
				onRequestEvent({ event: message.event });
				return;
			case "token":
				ctx.onToken?.(message.info as KafkaTokenInfo);
				return;
			case "stopped":
				stopped?.resolve();
				return;
		}
	}

	async function start(): Promise<void> {
		if (worker) throw new Error("Remote Kafka producers were already started");
		const url =
			config.workerUrl ?? new URL("./kafkaWorker.ts", import.meta.url).href;
		const thread = new Worker(url, { name: "balance-worker-kafka" });
		worker = thread;
		const ready = Promise.withResolvers<void>();
		let listening = false;
		thread.onmessage = (event: MessageEvent<KafkaToMainMessage>) => {
			const message = event.data;
			if (message.kind === "ready") {
				listening = true;
				ready.resolve();
				return;
			}
			if (message.kind === "error") {
				ready.reject(
					new Error(`Kafka worker could not start: ${message.message}`),
				);
				return;
			}
			onWorkerMessage({ message });
		};
		function died(error: Error): void {
			if (!listening) ready.reject(error);
			else fatal({ cause: error });
		}
		thread.onerror = (event) => {
			died(new Error(`Kafka worker failed: ${event.message}`));
		};
		thread.addEventListener("close", (event) => {
			if (stopping) return;
			const { code } = event as CloseEvent;
			died(new Error(`Kafka worker exited with code ${code}`));
		});
		const init: KafkaWorkerInit = {
			clientId: config.clientId,
			brokers: config.brokers,
			authMode: config.authMode,
			region: config.region,
			limits: config.limits,
			sendRing,
			ackRing,
			sendBell: sendBell.sab,
			ackBell: ackBell.sab,
		};
		thread.postMessage(init);
		try {
			await ready.promise;
		} catch (cause) {
			stopping = true;
			thread.terminate();
			throw cause;
		}
		ackLoop().catch((cause) => fatal({ cause }));
	}

	async function stop(): Promise<void> {
		if (!worker || stopping) return;
		stopping = true;
		stopped = Promise.withResolvers<void>();
		const timer = setTimeout(() => stopped?.resolve(), 5_000);
		try {
			post({ kind: "stop" });
			await stopped.promise;
		} catch {
			// Already dead: nothing to drain.
		} finally {
			clearTimeout(timer);
			worker.terminate();
		}
	}

	function snapshotOf({
		config: producerConfig,
	}: {
		config: ProducerConfig;
	}): ProducerConfigSnapshot {
		const { createPartitioner, ...rest } = producerConfig;
		return {
			...rest,
			explicitPartitioner: typeof createPartitioner === "function",
		};
	}

	function bytesOf({
		field,
	}: {
		field: Buffer | string | null | undefined;
	}): Uint8Array | null {
		if (field === null || field === undefined) return null;
		if (typeof field === "string") return encoder.encode(field);
		return field;
	}

	function messageMetaOf({
		message,
	}: {
		message: ProducerRecordMessage;
	}): SendMessageMeta {
		if (message.timestamp !== undefined)
			throw new TypeError(
				"A remote Kafka producer does not carry record timestamps",
			);
		const meta: SendMessageMeta = {};
		if (message.partition !== undefined) meta.partition = message.partition;
		if (message.headers !== undefined) {
			for (const value of Object.values(message.headers)) {
				if (typeof value !== "string")
					throw new TypeError(
						"A remote Kafka producer carries string headers only",
					);
			}
			meta.headers = message.headers as Record<string, string>;
		}
		return meta;
	}

	function sendMetaOf({
		producerId,
		seq,
		record,
	}: {
		producerId: number;
		seq: number;
		record: Parameters<Producer["send"]>[0];
	}): SendMeta {
		const first = record.messages[0];
		if (!first) throw new RangeError("Kafka batch cannot be empty");
		const shared = record.messages.every(
			(message) =>
				message.partition === first.partition &&
				message.headers === first.headers,
		);
		const meta: SendMeta = {
			producerId,
			seq,
			topic: record.topic,
			count: record.messages.length,
		};
		if (record.acks !== undefined) meta.acks = record.acks;
		if (record.compression !== undefined) meta.compression = record.compression;
		if (record.timeout !== undefined) meta.timeout = record.timeout;
		if (shared) meta.shared = messageMetaOf({ message: first });
		else
			meta.messages = record.messages.map((message) =>
				messageMetaOf({ message }),
			);
		return meta;
	}

	function enqueueSend({
		reqId,
		meta,
		records,
	}: {
		reqId: number;
		meta: SendMeta;
		records: LaneRecord[];
	}): void {
		const metaBytes = encodeSendMeta({ meta });
		const length = sendByteLength({ metaBytes, records });
		stats.sends++;
		const at =
			length <= sends.maxFrameBytes
				? sends.claim({ type: LANE.SEND, maxLength: length })
				: -1;
		if (at >= 0) {
			writeSend({ bytes: sends.payload, at, reqId, metaBytes, records });
			sends.publish({ length });
			sends.flush();
			return;
		}
		// Too big for the ring, or the ring is full: the message port carries it instead.
		stats.sendsByPost++;
		const bytes = new Uint8Array(length);
		writeSend({ bytes, at: 0, reqId, metaBytes, records });
		post({ kind: "send", bytes: bytes.buffer }, [bytes.buffer]);
	}

	function producer(producerConfig: ProducerConfig): KafkaProducerClient {
		if (!worker)
			throw new Error(
				"Remote Kafka producers must be started before a producer is created",
			);
		const producerId = nextProducerId++;
		let nextSeq = 0;
		let closed = false;
		post({
			kind: "create",
			producerId,
			config: snapshotOf({ config: producerConfig }),
		});

		function connect(): Promise<void> {
			return control({ kind: "connect", producerId, reqId: nextReqId++ });
		}

		function disconnect(): Promise<void> {
			// Closed before the worker hears of it: a send racing the disconnect is still answered, a later one throws at once.
			closed = true;
			requestListeners.delete(producerId);
			return control({ kind: "disconnect", producerId, reqId: nextReqId++ });
		}

		async function send(
			record: Parameters<Producer["send"]>[0],
		): Promise<RecordMetadata[]> {
			const meta = sendMetaOf({ producerId, seq: nextSeq, record });
			const records: LaneRecord[] = record.messages.map((message) => ({
				key: bytesOf({ field: message.key }),
				value: bytesOf({ field: message.value }),
			}));
			if (closed)
				throw new KafkaJSError("The producer is disconnected", {
					retriable: false,
				});
			if (failed)
				throw new KafkaJSError("Kafka worker failed", { retriable: false });
			const reqId = nextReqId++;
			nextSeq++;
			const settled = awaitAck({ reqId });
			enqueueSend({ reqId, meta, records });
			const ack = await settled;
			if (!ack.ok) throw laneErrorToKafkaError({ error: ack.error });
			return ack.metadata;
		}

		function transaction(): Promise<never> {
			return Promise.reject(
				new Error("A remote Kafka producer offers no transactions"),
			);
		}

		function on(eventName: string, listener: RequestListener): () => void {
			if (eventName !== PRODUCER_EVENTS.REQUEST)
				throw new Error(
					`A remote Kafka producer reports ${PRODUCER_EVENTS.REQUEST} only`,
				);
			let listeners = requestListeners.get(producerId);
			if (!listeners) {
				listeners = new Set();
				requestListeners.set(producerId, listeners);
			}
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}

		return {
			connect,
			disconnect,
			send,
			transaction,
			on: on as unknown as Producer["on"],
			events: PRODUCER_EVENTS,
		};
	}

	function readStats(): Record<string, number> {
		return { ...stats, pending: pending.size };
	}

	return { start, stop, producer, readStats };
}

type ProducerRecordMessage = Parameters<
	Producer["send"]
>[0]["messages"][number];
