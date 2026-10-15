/**
 * Concurrent ListOffsets on one admin while a broker dies and comes back: the worker's health refresh
 * under a broker SIGKILL, minus the worker. PROBE_CONCURRENCY loops each call listOffsets back to back
 * (5s timeout, like the KafkaJS shim) on the same native admin for PROBE_SECONDS; the parent
 * orchestration kills and restarts brokers around it. Prints a count of outcomes; a native heap
 * corruption aborts the process instead (exit 134).
 *
 *   PROBE_BROKERS=... PROBE_TOPIC=<16-partition topic> bun scripts/stressAdminListOffsets.ts
 */
import { CONFLUENT_PACKAGE } from "../src/native/nativePackage.js";

const brokers = process.env.PROBE_BROKERS;
const topic = process.env.PROBE_TOPIC;
if (!brokers || !topic)
	throw new Error("PROBE_BROKERS and PROBE_TOPIC are required");
const partitions = Number(process.env.PROBE_PARTITIONS ?? 16);
const concurrency = Number(process.env.PROBE_CONCURRENCY ?? 8);
const seconds = Number(process.env.PROBE_SECONDS ?? 120);

type NativeAdmin = {
	listOffsets(
		partitions: {
			topic: string;
			partition: number;
			offset: { timestamp: number };
		}[],
		options: { timeout: number; isolationLevel: number },
		callback: (error: { code: number } | null) => void,
	): void;
};
const confluent = require(CONFLUENT_PACKAGE) as {
	AdminClient: {
		create(conf: object): { _client: NativeAdmin; disconnect(): void };
	};
};
const admin = confluent.AdminClient.create({
	"bootstrap.servers": brokers,
	"socket.connection.setup.timeout.ms": 5_000,
	"reconnect.backoff.max.ms": 1_000,
	// Every metadata response notifies the cache's observers: more of them, more chances to land in the window.
	"topic.metadata.refresh.interval.ms": Number(
		process.env.PROBE_METADATA_REFRESH_MS ?? 300_000,
	),
	log_level: 0,
});
const specs = [-1, -2].map((timestamp) =>
	Array.from({ length: partitions }, (_, partition) => ({
		topic,
		partition,
		offset: { timestamp },
	})),
);
const options = { timeout: 5_000, isolationLevel: 1 };
const outcomes: Record<string, number> = {};
const deadline = Date.now() + seconds * 1_000;

async function loop(index: number): Promise<void> {
	for (let call = 0; Date.now() < deadline; call++) {
		const code = await new Promise<number>((resolve) =>
			admin._client.listOffsets(specs[(index + call) % 2], options, (error) =>
				resolve(error?.code ?? 0),
			),
		);
		outcomes[code] = (outcomes[code] ?? 0) + 1;
	}
}
await Promise.all(Array.from({ length: concurrency }, (_, i) => loop(i)));
admin.disconnect();
console.log(`ok: ${JSON.stringify(outcomes)}`);
process.exit(0);
