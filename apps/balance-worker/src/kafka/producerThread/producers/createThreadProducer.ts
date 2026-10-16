/**
 * One producer living on the producer thread: `RecordMetadata[]` on success, otherwise the producer's
 * error rebuilt with its code, verdicts and causes, so it classifies as it would have on that thread.
 */
import type {
	KafkaProducerClient,
	ProducerConfig,
	ProducerRecord,
	RecordMetadata,
} from "@autumn/kafka";
import { kafkaErrorOf } from "../rules/kafkaErrorOf.js";
import { producerConfigSnapshotOf } from "../rules/producerConfigSnapshotOf.js";
import { sendFrameOf } from "../rules/sendFrameOf.js";
import type { DecideToProducerMessage } from "../types/producerThreadMessages.js";
import type { RequestListener } from "../types/threadedProducers.js";
import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";
import { enqueueSend } from "./enqueueSend.js";
import { postToProducerThread } from "./postToProducerThread.js";
import { awaitAck } from "./receiveAcks.js";

/** A failure the thread never saw: the send's fate is decided here, and it was never sent. */
function producerThreadError(message: string): Error {
	const error = Object.assign(new Error(message), { retriable: false });
	error.name = "ProducerThreadError";
	return error;
}

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
	/** A send that never reached the thread leaves a gap in the sequence: every later send would be held. */
	let lostSend: Error | null = null;
	postToProducerThread({
		scope,
		message: {
			kind: "create",
			producerId,
			config: producerConfigSnapshotOf({ config: producerConfig }),
		},
	});

	/** Frames carry the id as a u32, so it wraps before 2^32 like the HTTP workers' ids do. */
	function takeReqId(): number {
		const reqId = state.nextReqId;
		state.nextReqId = reqId === 0xfffffffe ? 1 : reqId + 1;
		return reqId;
	}

	function connect(): Promise<void> {
		return control({
			scope,
			message: { kind: "connect", producerId, reqId: takeReqId() },
		});
	}

	function disconnect(): Promise<void> {
		// Closed before the thread hears of it: a send racing the disconnect is still answered, a later one throws.
		closed = true;
		scope.requestListeners.delete(producerId);
		return control({
			scope,
			message: { kind: "disconnect", producerId, reqId: takeReqId() },
		});
	}

	async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
		const { meta, records } = sendFrameOf({ producerId, seq: nextSeq, record });
		if (closed) throw producerThreadError("The producer is disconnected");
		if (state.failed || state.stopping)
			throw producerThreadError(
				state.failed ? "Producer thread failed" : "Producer thread stopped",
			);
		if (lostSend) throw lostSend;
		const reqId = takeReqId();
		const settled = awaitAck({ scope, reqId });
		try {
			enqueueSend({ scope, reqId, meta, records });
		} catch (cause) {
			scope.pending.delete(reqId);
			lostSend = producerThreadError(
				`Producer ${producerId} could not hand a send to the producer thread: ${String((cause as Error)?.message ?? cause)}`,
			);
			throw lostSend;
		}
		nextSeq++;
		const ack = await settled;
		if (!ack.ok) throw kafkaErrorOf({ error: ack.error });
		return ack.metadata;
	}

	function transaction(): Promise<never> {
		return Promise.reject(
			new Error("A threaded producer offers no transactions"),
		);
	}

	function onRequestTimings(listener: RequestListener): void {
		const listeners =
			scope.requestListeners.get(producerId) ?? new Set<RequestListener>();
		scope.requestListeners.set(producerId, listeners);
		listeners.add(listener);
	}

	return {
		connect,
		disconnect,
		send,
		transaction,
		onRequestTimings,
	};
}
