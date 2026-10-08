/** Control messages: create, connect and disconnect one producer, or stop them all. */
import { readSendFrame } from "../frames/sendFrame.js";
import type { ProducerLoopScope } from "../types/producerLoopScope.js";
import type { ProducerConfigSnapshot } from "../types/producerThreadMessages.js";
import { drainSends } from "./dispatchSends.js";
import { answerControl, answerDisconnected } from "./sendAcks.js";

export function createProducer({
	scope,
	producerId,
	config,
}: {
	scope: ProducerLoopScope;
	producerId: number;
	config: ProducerConfigSnapshot;
}): void {
	const producer = scope.ctx.kafka.producer(config);
	scope.producers.set(producerId, producer);
	producer.onRequestTimings?.(function reportRequest(timing) {
		scope.ctx.post({ kind: "request", event: { producerId, ...timing } });
	});
}

export function connectProducer({
	scope,
	producerId,
	reqId,
}: {
	scope: ProducerLoopScope;
	producerId: number;
	reqId: number;
}): void {
	const producer = scope.producers.get(producerId);
	answerControl({
		scope,
		reqId,
		work: producer
			? producer.connect()
			: Promise.reject(new Error(`Producer thread: no producer ${producerId}`)),
	});
}

export function disconnectProducer({
	scope,
	producerId,
	reqId,
}: {
	scope: ProducerLoopScope;
	producerId: number;
	reqId: number;
}): void {
	const { producers, nextSeq, held } = scope;
	const producer = producers.get(producerId);
	producers.delete(producerId);
	nextSeq.delete(producerId);
	// Frames still waiting for an earlier sequence number will never see it: answer them now.
	for (const bytes of held.get(producerId)?.values() ?? [])
		answerDisconnected({
			scope,
			reqId: readSendFrame({ bytes }).reqId,
			producerId,
		});
	held.delete(producerId);
	answerControl({
		scope,
		reqId,
		work: producer ? producer.disconnect() : Promise.resolve(),
	});
}

/**
 * Flushes before it disconnects: every send already published is dispatched, every send in flight is
 * acked, and a frame still waiting for an earlier sequence number is answered disconnected.
 */
export async function stopProducers({
	scope,
}: {
	scope: ProducerLoopScope;
}): Promise<void> {
	const { producers, held, state } = scope;
	state.stopping = true;
	drainSends({ scope });
	for (const [producerId, waiting] of held)
		for (const bytes of waiting.values())
			answerDisconnected({
				scope,
				reqId: readSendFrame({ bytes }).reqId,
				producerId,
			});
	held.clear();
	await Promise.allSettled(scope.inFlight);
	await state.ackPump;
	await Promise.allSettled(
		[...producers.values()].map((producer) => producer.disconnect()),
	);
	producers.clear();
	scope.ctx.post({ kind: "stopped" });
}
