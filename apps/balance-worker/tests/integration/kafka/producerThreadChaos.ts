/**
 * The production producer loop over a real kafkajs client whose sockets the test can cut: a "drop" on the
 * `producer-thread-chaos` channel destroys every open broker socket, as a broker restart or network blip would.
 */
import { connect, type Socket } from "node:net";
import { createKafkaClient } from "@autumn/kafka";
import { Kafka, logLevel } from "kafkajs";
import { startProducerLoop } from "../../../src/kafka/producerThread/startProducerLoop.js";
import type {
	DecideToProducerMessage,
	ProducerThreadInit,
} from "../../../src/kafka/producerThread/types/producerThreadMessages.js";

declare var self: Worker;

const sockets = new Set<Socket>();
const chaos = new BroadcastChannel("producer-thread-chaos");
chaos.onmessage = function drop() {
	const dropped = sockets.size;
	for (const socket of sockets) socket.destroy();
	chaos.postMessage({ dropped });
};

function socketFactory({
	host,
	port,
	onConnect,
}: {
	host: string;
	port: number;
	onConnect: () => void;
}): Socket {
	const socket = connect({ host, port }, onConnect);
	sockets.add(socket);
	socket.on("close", function forget() {
		sockets.delete(socket);
	});
	return socket;
}

let loop: ReturnType<typeof startProducerLoop> | null = null;

self.onmessage = function receive(
	event: MessageEvent<ProducerThreadInit | DecideToProducerMessage>,
) {
	const message = event.data;
	if ("kind" in message) {
		loop?.receive(message);
		return;
	}
	const kafka = new Kafka({
		...createKafkaClient({
			clientId: message.clientId,
			brokers: message.brokers,
			transport: {},
			limits: message.limits,
		}),
		logLevel: logLevel.NOTHING,
		socketFactory,
	});
	loop = startProducerLoop({
		ctx: { kafka, post: (reply) => self.postMessage(reply) },
		init: message,
	});
	self.postMessage({ kind: "ready" });
};
