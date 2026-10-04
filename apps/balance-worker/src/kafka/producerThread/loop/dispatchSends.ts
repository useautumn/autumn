/** Send frames off the ring (or the message port), each one `producer.send` in its producer's own order. */
import type { ProducerRecord } from "kafkajs";
import {
	readSendFrame,
	SEND_FRAME,
	type SendFrame,
} from "../frames/sendFrame.js";
import { producerErrorOf } from "../rules/producerErrorOf.js";
import type { ProducerLoopScope } from "../types/producerLoopScope.js";
import { answerDisconnected, sendAck } from "./sendAcks.js";

function recordOf({ meta, records }: Omit<SendFrame, "reqId">): ProducerRecord {
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

function send({
	scope,
	frame: { reqId, meta, records },
}: {
	scope: ProducerLoopScope;
	frame: SendFrame;
}): void {
	const producer = scope.producers.get(meta.producerId);
	if (!producer?.send) {
		answerDisconnected({ scope, reqId, producerId: meta.producerId });
		return;
	}
	producer.send(recordOf({ meta, records })).then(
		function sent(metadata) {
			sendAck({ scope, reqId, ack: { ok: true, metadata } });
		},
		function refused(cause: unknown) {
			sendAck({
				scope,
				reqId,
				ack: { ok: false, error: producerErrorOf({ cause }) },
			});
		},
	);
}

export function dispatchSend({
	scope,
	bytes,
}: {
	scope: ProducerLoopScope;
	bytes: Uint8Array;
}): void {
	const { producers, nextSeq, held } = scope;
	const frame = readSendFrame({ bytes });
	const { producerId, seq } = frame.meta;
	// A send that reaches the thread after its producer's disconnect is answered, never held.
	if (!producers.has(producerId)) {
		answerDisconnected({ scope, reqId: frame.reqId, producerId });
		return;
	}
	const expected = nextSeq.get(producerId) ?? 0;
	if (seq !== expected) {
		const waiting = held.get(producerId) ?? new Map<number, Uint8Array>();
		waiting.set(seq, bytes);
		held.set(producerId, waiting);
		return;
	}
	nextSeq.set(producerId, expected + 1);
	send({ scope, frame });
	const next = held.get(producerId)?.get(expected + 1);
	if (!next) return;
	held.get(producerId)?.delete(expected + 1);
	dispatchSend({ scope, bytes: next });
}

function drainSends({ scope }: { scope: ProducerLoopScope }): number {
	const { sends } = scope;
	let read = 0;
	for (;;) {
		const frame = sends.next();
		if (!frame) break;
		if (frame.type !== SEND_FRAME)
			throw new Error(`Producer thread: unexpected frame ${frame.type}`);
		// A copy: a held frame must outlive its ring slot, which is reused once we advance.
		const bytes = frame.bytes.slice();
		sends.advance();
		read++;
		dispatchSend({ scope, bytes });
	}
	if (read > 0) sends.release();
	return read;
}

export async function sendLoop({
	scope,
}: {
	scope: ProducerLoopScope;
}): Promise<void> {
	while (!scope.state.stopping) {
		if (drainSends({ scope }) > 0) continue;
		await scope.sendSignal.sleep({
			hasWork: scope.sends.hasWork,
			timeoutMs: 50,
		});
	}
}
