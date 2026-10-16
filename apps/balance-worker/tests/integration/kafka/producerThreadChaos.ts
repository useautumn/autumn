/**
 * The production producer loop over a real librdkafka client whose broker connections the test can cut: a "drop"
 * on the `producer-thread-chaos` channel shuts down every TCP socket this process holds to a broker port, as a
 * broker restart or network blip would. librdkafka owns its sockets natively, so they are found through /proc
 * and shut down (never closed) with libc's `shutdown`, which leaves the descriptor to librdkafka.
 */

import { dlopen, FFIType } from "bun:ffi";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { createKafka, createKafkaClient } from "@autumn/kafka";
import { startProducerLoop } from "../../../src/kafka/producerThread/startProducerLoop.js";
import type {
	DecideToProducerMessage,
	ProducerThreadInit,
} from "../../../src/kafka/producerThread/types/producerThreadMessages.js";

declare var self: Worker;

const SHUT_RDWR = 2;
const libc = dlopen("libc.so.6", {
	shutdown: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
});

/** Socket inodes whose remote end is one of `ports`, from the kernel's TCP tables. */
function brokerSocketInodes({ ports }: { ports: Set<number> }): Set<string> {
	const inodes = new Set<string>();
	for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
		let lines: string[];
		try {
			lines = readFileSync(table, "utf8").trim().split("\n").slice(1);
		} catch {
			continue;
		}
		for (const line of lines) {
			const fields = line.trim().split(/\s+/);
			const remotePort = Number.parseInt(fields[2]?.split(":")[1] ?? "", 16);
			if (ports.has(remotePort) && fields[9]) inodes.add(fields[9]);
		}
	}
	return inodes;
}

function dropBrokerSockets({ ports }: { ports: Set<number> }): number {
	const inodes = brokerSocketInodes({ ports });
	let dropped = 0;
	for (const fd of readdirSync("/proc/self/fd")) {
		let target: string;
		try {
			target = readlinkSync(`/proc/self/fd/${fd}`);
		} catch {
			continue;
		}
		const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1];
		if (!inode || !inodes.has(inode)) continue;
		if (libc.symbols.shutdown(Number(fd), SHUT_RDWR) === 0) dropped++;
	}
	return dropped;
}

let loop: ReturnType<typeof startProducerLoop> | null = null;
let brokerPorts = new Set<number>();

const chaos = new BroadcastChannel("producer-thread-chaos");
chaos.onmessage = function drop() {
	chaos.postMessage({ dropped: dropBrokerSockets({ ports: brokerPorts }) });
};

self.onmessage = function receive(
	event: MessageEvent<ProducerThreadInit | DecideToProducerMessage>,
) {
	const message = event.data;
	if ("kind" in message) {
		loop?.receive(message);
		return;
	}
	brokerPorts = new Set(
		message.brokers.map((broker) => Number(broker.split(":").at(-1))),
	);
	const kafka = createKafka(
		createKafkaClient({
			clientId: message.clientId,
			brokers: message.brokers,
			transport: {},
			limits: message.limits,
		}),
	);
	loop = startProducerLoop({
		ctx: { kafka, post: (reply) => self.postMessage(reply) },
		init: message,
	});
	self.postMessage({ kind: "ready" });
};
