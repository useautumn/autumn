/** Control messages: create, connect and disconnect one producer, or stop them all. */
import { explicitPartitioner } from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import { readSendFrame } from "../frames/sendFrame.js";
import type { ProducerLoopScope } from "../types/producerLoopScope.js";
import type { ProducerConfigSnapshot } from "../types/producerThreadMessages.js";
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

export async function stopProducers({
	scope,
}: {
	scope: ProducerLoopScope;
}): Promise<void> {
	scope.state.stopping = true;
	await Promise.allSettled(
		[...scope.producers.values()].map((producer) => producer.disconnect()),
	);
	scope.producers.clear();
	scope.ctx.post({ kind: "stopped" });
}
