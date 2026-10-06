/**
 * The producer thread: builds the same kafkajs client the decide thread would (brokers, MSK IAM signing,
 * limits) and runs the partition producers, so encoding, compression and the broker sockets never take
 * time on the decide thread.
 */
import { createKafkaClient, createKafkaTransport } from "@autumn/kafka";
import { Kafka } from "kafkajs";
import { type ProducerLoop, startProducerLoop } from "./startProducerLoop.js";
import type {
	DecideToProducerMessage,
	ProducerThreadInit,
	ProducerToDecideMessage,
} from "./types/producerThreadMessages.js";

declare var self: Worker;

let loop: ProducerLoop | null | undefined;

self.onmessage = function receive(
	event: MessageEvent<ProducerThreadInit | DecideToProducerMessage>,
) {
	const message = event.data;
	if ("kind" in message) loop?.receive(message);
	else loop ??= startThread(message);
};

function post(message: ProducerToDecideMessage): void {
	self.postMessage(message);
}

function reportToken(info: unknown): void {
	post({ kind: "token", info });
}

/** Null when the client could not be built; the decide thread has been told why. */
function startThread(init: ProducerThreadInit): ProducerLoop | null {
	let started: ProducerLoop;
	try {
		const kafka = new Kafka(
			createKafkaClient({
				clientId: init.clientId,
				brokers: init.brokers,
				transport: createKafkaTransport({
					authMode: init.authMode,
					region: init.region,
					sasl: init.sasl,
					onToken: reportToken,
				}),
				limits: init.limits,
			}),
		);
		started = startProducerLoop({ ctx: { kafka, post }, init });
	} catch (cause) {
		post({
			kind: "error",
			message: String((cause as Error)?.message ?? cause),
		});
		return null;
	}
	post({ kind: "ready" });
	return started;
}
