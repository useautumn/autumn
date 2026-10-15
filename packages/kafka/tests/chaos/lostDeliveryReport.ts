/**
 * Looks for a producer send that never settles: PRODUCERS idempotent producers (the same createKafka path the
 * workers use), each with IN_FLIGHT concurrent single-partition sends of 1..5 records in a loop. A send not settled
 * after STALL_MS (well past message.timeout.ms) is reported with its producer, partition and send count; the
 * producer then stops sending so the stall stays inspectable. Prints one JSON line per report and a summary.
 *
 *   KAFKA_BROKERS=... DURATION_MS=1200000 bun packages/kafka/tests/chaos/lostDeliveryReport.ts
 */
import { createKafka, createKafkaClient } from "../../src/kafka.js";

const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
if (brokers.length === 0) throw new Error("KAFKA_BROKERS is required");
const PRODUCERS = Number(process.env.PRODUCERS ?? 16);
const IN_FLIGHT = Number(process.env.IN_FLIGHT ?? 2);
const DURATION_MS = Number(process.env.DURATION_MS ?? 600_000);
const STALL_MS = Number(process.env.STALL_MS ?? 60_000);

const kafka = createKafka(
	createKafkaClient({
		clientId: "lost-dr",
		brokers,
		transport: {},
		limits: {
			connectionTimeoutMs: 3_000,
			requestTimeoutMs: 10_000,
			retryCount: 2,
			initialRetryTimeMs: 100,
			maxRetryTimeMs: 1_000,
		},
	}),
);
const admin = kafka.admin();
await admin.connect();
const topic = `lost-dr-${crypto.randomUUID().slice(0, 8)}`;
await admin.createTopics({
	topics: [{ topic, numPartitions: PRODUCERS, replicationFactor: 2 }],
});
await Bun.sleep(3_000);

type Stall = { producer: number; sends: number; records: number; at: number };
const stalls: Stall[] = [];
let settled = 0;
let failed = 0;
const failures: Record<string, number> = {};
const startedAt = Date.now();
const endsAt = startedAt + DURATION_MS;
const emit = (fields: Record<string, unknown>) =>
	console.log(JSON.stringify({ t: Date.now(), ...fields }));

async function run(index: number): Promise<void> {
	const producer = kafka.producer({ idempotent: true });
	await producer.connect();
	let sends = 0;
	let stalled = false;
	async function lane(): Promise<void> {
		while (Date.now() < endsAt && !stalled) {
			const records = 1 + Math.floor(Math.random() * 5);
			sends++;
			const send = producer.send({
				topic,
				messages: Array.from({ length: records }, (_, i) => ({
					key: `k${i}`,
					value: `p${index} s${sends} r${i}`,
					partition: index,
				})),
			});
			const outcome = await Promise.race([
				send.then(
					() => "ok" as const,
					(cause: Error) => `err:${cause.name}` as const,
				),
				Bun.sleep(STALL_MS).then(() => "stalled" as const),
			]);
			if (outcome === "stalled") {
				stalled = true;
				const stall = { producer: index, sends, records, at: Date.now() };
				stalls.push(stall);
				emit({ event: "stall", ...stall });
				return;
			}
			if (outcome === "ok") settled++;
			else {
				failed++;
				failures[outcome] = (failures[outcome] ?? 0) + 1;
			}
		}
	}
	await Promise.all(Array.from({ length: IN_FLIGHT }, lane));
	if (!stalled) await producer.disconnect();
}

const progress = setInterval(
	() =>
		emit({ event: "progress", settled, failed, stalls: stalls.length }),
	60_000,
);
await Promise.all(Array.from({ length: PRODUCERS }, (_, i) => run(i)));
clearInterval(progress);
emit({
	event: "summary",
	seconds: Math.round((Date.now() - startedAt) / 1000),
	settled,
	failed,
	failures,
	stalls,
});
await admin.deleteTopics({ topics: [topic] });
await admin.disconnect();
process.exit(stalls.length ? 1 : 0);
