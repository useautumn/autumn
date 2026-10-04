/**
 * The Kafka worker thread (serial-decide arms C and D): builds the same kafkajs client the main thread
 * would (brokers, MSK IAM signing, limits) and runs the partition producers, so encoding, compression and
 * the broker sockets never take time on the decide thread.
 */
import { createKafkaClient, createKafkaTransport } from "@autumn/kafka";
import { Kafka } from "kafkajs";
import { type KafkaWorkerLoop, startKafkaWorker } from "./kafkaWorkerLoop.js";
import type { KafkaWorkerInit, MainToKafkaMessage } from "./laneProtocol.js";

declare var self: Worker;

let loop: KafkaWorkerLoop | null = null;

self.onmessage = (
	event: MessageEvent<KafkaWorkerInit | MainToKafkaMessage>,
) => {
	const message = event.data;
	if ("kind" in message) {
		loop?.onMessage(message);
		return;
	}
	if (loop) return;
	start(message);
};

function start(init: KafkaWorkerInit): void {
	try {
		const kafka = new Kafka(
			createKafkaClient({
				clientId: init.clientId,
				brokers: init.brokers,
				transport: createKafkaTransport({
					authMode: init.authMode,
					region: init.region,
					onToken: (info) => postMessage({ kind: "token", info }),
				}),
				limits: init.limits,
			}),
		);
		loop = startKafkaWorker({
			ctx: { kafka, post: (message) => postMessage(message) },
			init,
		});
	} catch (cause) {
		postMessage({
			kind: "error",
			message: String((cause as Error)?.message ?? cause),
		});
		return;
	}
	postMessage({ kind: "ready" });
}
