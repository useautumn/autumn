import { explicitPartitioner } from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
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
	const { explicitPartitioner: explicit, ...rest } = config;
	const producerConfig: ProducerConfig = explicit
		? { ...rest, createPartitioner: explicitPartitioner }
		: rest;
	const producer = scope.ctx.kafka.producer(producerConfig);
	scope.producers.set(producerId, producer);
	if (!producer.on || !producer.events) return;
	producer.on(producer.events.REQUEST, function reportRequest({ payload }) {
		scope.ctx.post({
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
