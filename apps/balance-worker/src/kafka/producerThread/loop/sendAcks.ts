/** Every outcome goes back to the decide thread: sends as ack frames, control requests as messages. */
import { ACK_FRAME, encodeAckFrame, type SendAck } from "../frames/ackFrame.js";
import { producerErrorOf } from "../rules/producerErrorOf.js";
import type { ProducerLoopScope } from "../types/producerLoopScope.js";

/** Acks leave in the order their sends settled; a full ring waits for the decide thread to read. */
async function pumpAcks({
	scope,
}: {
	scope: ProducerLoopScope;
}): Promise<void> {
	const { acks, ackQueue, state } = scope;
	state.pumpingAcks = true;
	try {
		while (ackQueue.length > 0) {
			const next = ackQueue[0] as Uint8Array;
			if (acks.write({ type: ACK_FRAME, payload: next })) {
				ackQueue.shift();
				continue;
			}
			acks.flush();
			await acks.waitForRoom({ maxLength: next.length });
		}
		acks.flush();
	} finally {
		state.pumpingAcks = false;
	}
}

export function sendAck({
	scope,
	reqId,
	ack,
}: {
	scope: ProducerLoopScope;
	reqId: number;
	ack: SendAck;
}): void {
	const { state } = scope;
	scope.ackQueue.push(encodeAckFrame({ reqId, ack }));
	if (!state.pumpingAcks) state.ackPump = pumpAcks({ scope });
}

export function answerDisconnected({
	scope,
	reqId,
	producerId,
}: {
	scope: ProducerLoopScope;
	reqId: number;
	producerId: number;
}): void {
	sendAck({
		scope,
		reqId,
		ack: {
			ok: false,
			error: {
				kind: "other",
				name: "KafkaJSError",
				message: `The producer is disconnected (no producer ${producerId} on the producer thread)`,
				retriable: false,
			},
		},
	});
}

export function answerControl({
	scope,
	reqId,
	work,
}: {
	scope: ProducerLoopScope;
	reqId: number;
	work: Promise<void>;
}): void {
	work.then(
		function done() {
			scope.ctx.post({ kind: "done", reqId });
		},
		function failed(cause: unknown) {
			scope.ctx.post({
				kind: "failed",
				reqId,
				error: producerErrorOf({ cause }),
			});
		},
	);
}
