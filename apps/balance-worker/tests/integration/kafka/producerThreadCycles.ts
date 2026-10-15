/**
 * Starts and stops the producer thread PRODUCER_THREAD_CYCLES times in this one process, sending a few
 * records through each, and prints one JSON line per cycle with the process's threads, RSS and fds.
 * It then returns without process.exit: the parent asserts the process ends on its own, with code 0.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createThreadedProducers } from "../../../src/kafka/producerThread/createThreadedProducers.js";
import { createTestKafka } from "../../fixtures/testKafka.js";

/** PRODUCER_THREAD_TERMINATE=1 terminates each thread after stop, what stopProducerThread avoids. */
const terminate = process.env.PRODUCER_THREAD_TERMINATE === "1";
const threads: Worker[] = [];
const BaseWorker = globalThis.Worker;
globalThis.Worker = class RecordedWorker extends BaseWorker {
	constructor(...args: ConstructorParameters<typeof BaseWorker>) {
		super(...args);
		threads.push(this);
	}
} as typeof Worker;
const cycles = Number(process.env.PRODUCER_THREAD_CYCLES ?? 50);
const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
if (brokers.length === 0) throw new Error("KAFKA_BROKERS is required");
const limits = {
	connectionTimeoutMs: 3_000,
	requestTimeoutMs: 10_000,
	retryCount: 2,
	initialRetryTimeMs: 100,
	maxRetryTimeMs: 1_000,
};

function proc() {
	const status = readFileSync("/proc/self/status", "utf8");
	return {
		threads: Number(/Threads:\s+(\d+)/.exec(status)?.[1]),
		rssMb: Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]) / 1024,
		fds: readdirSync("/proc/self/fd").length,
	};
}
function emit(fields: Record<string, unknown>): void {
	process.stdout.write(`${JSON.stringify({ t: Date.now(), ...fields })}\n`);
}

const admin = createTestKafka({
	clientId: "producer-thread-cycles",
	brokers,
}).admin();
await admin.connect();
const topic = `producer-thread-cycles-${crypto.randomUUID()}`;
await admin.createTopics({
	topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
});
await admin.disconnect();
emit({ cycle: -1, ...proc() });

for (let cycle = 0; cycle < cycles; cycle++) {
	const fatal: unknown[] = [];
	const producers = createThreadedProducers({
		ctx: {
			logger: { warn() {}, error() {} },
			onFatal: ({ cause }) => fatal.push(cause),
		},
		config: {
			clientId: `producer-thread-cycles-${cycle}`,
			brokers,
			authMode: "none",
			limits,
			sendRingBytes: 1 << 20,
			ackRingBytes: 1 << 16,
		},
	});
	await producers.start();
	const producer = producers.producer({ idempotent: true });
	await producer.connect();
	for (let i = 0; i < 5; i++)
		await producer.send?.({
			topic,
			messages: [{ key: String(i), value: `cycle ${cycle}` }],
		});
	await producer.disconnect();
	await producers.stop();
	if (terminate) await threads.at(-1)?.terminate();
	if (fatal.length) throw new Error(`fatal in cycle ${cycle}: ${fatal}`);
	emit({ cycle, ...proc() });
}

const cleanup = createTestKafka({
	clientId: "producer-thread-cycles",
	brokers,
}).admin();
await cleanup.connect();
await cleanup.deleteTopics({ topics: [topic] });
await cleanup.disconnect();
Bun.gc(true);
await Bun.sleep(2_000);
emit({ cycle: "end", ...proc() });
