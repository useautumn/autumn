/**
 * One kafkajs-shaped producer living on the producer thread: `RecordMetadata[]` on success, a
 * `KafkaJSProtocolError` when the broker refused, a `KafkaJSError` for every failure whose fate is unknown.
 */
import type { KafkaProducerClient } from "@autumn/kafka";
import {
	KafkaJSError,
	type Producer,
	type ProducerConfig,
	type RecordMetadata,
} from "kafkajs";
import { kafkaErrorOf } from "../rules/kafkaErrorOf.js";
import { producerConfigSnapshotOf } from "../rules/producerConfigSnapshotOf.js";
import { sendFrameOf } from "../rules/sendFrameOf.js";
import type { DecideToProducerMessage } from "../types/producerThreadMessages.js";
import type { RequestListener } from "../types/threadedProducers.js";
import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";
import { enqueueSend } from "./enqueueSend.js";
import { postToProducerThread } from "./postToProducerThread.js";
import { awaitAck } from "./receiveAcks.js";

const PRODUCER_EVENTS = { REQUEST: "producer.network.request" } as const;

async function control({
	scope,
	message,
}: {
	scope: ThreadedProducersScope;
	message: DecideToProducerMessage & { reqId: number };
}): Promise<void> {
	const settled = awaitAck({ scope, reqId: message.reqId });
	postToProducerThread({ scope, message });
	const ack = await settled;
	if (!ack.ok) throw kafkaErrorOf({ error: ack.error });
}

export function createThreadProducer({
	scope,
	producerConfig,
}: {
	scope: ThreadedProducersScope;
	producerConfig: ProducerConfig;
}): KafkaProducerClient {
	const { state } = scope;
	if (!state.thread)
		throw new Error(
			"Threaded producers must be started before a producer is created",
		);
	const producerId = state.nextProducerId++;
	let nextSeq = 0;
	let closed = false;
	postToProducerThread({
		scope,
		message: {
			kind: "create",
			producerId,
			config: producerConfigSnapshotOf({ config: producerConfig }),
		},
	});

	function connect(): Promise<void> {
		return control({
			scope,
			message: { kind: "connect", producerId, reqId: state.nextReqId++ },
		});
	}

	function disconnect(): Promise<void> {
		// Closed before the thread hears of it: a send racing the disconnect is still answered, a later one throws.
		closed = true;
		scope.requestListeners.delete(producerId);
		return control({
			scope,
			message: { kind: "disconnect", producerId, reqId: state.nextReqId++ },
		});
	}

	async function send(
		record: Parameters<Producer["send"]>[0],
	): Promise<RecordMetadata[]> {
		const { meta, records } = sendFrameOf({ producerId, seq: nextSeq, record });
		if (closed)
			throw new KafkaJSError("The producer is disconnected", {
				retriable: false,
			});
		if (state.failed)
			throw new KafkaJSError("Producer thread failed", { retriable: false });
		const reqId = state.nextReqId++;
		nextSeq++;
		const settled = awaitAck({ scope, reqId });
		enqueueSend({ scope, reqId, meta, records });
		const ack = await settled;
		if (!ack.ok) throw kafkaErrorOf({ error: ack.error });
		return ack.metadata;
	}

	function transaction(): Promise<never> {
		return Promise.reject(
			new Error("A threaded producer offers no transactions"),
		);
	}

	function on(eventName: string, listener: RequestListener): () => void {
		if (eventName !== PRODUCER_EVENTS.REQUEST)
			throw new Error(
				`A threaded producer reports ${PRODUCER_EVENTS.REQUEST} only`,
			);
		const listeners =
			scope.requestListeners.get(producerId) ?? new Set<RequestListener>();
		scope.requestListeners.set(producerId, listeners);
		listeners.add(listener);
		return function off() {
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
