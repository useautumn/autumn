/**
 * Drives the addon's AdminClientListOffsets worker down AdminClient::ListOffsets' early return (native
 * client disconnected), which never assigns m_event_response, so its destructor frees whatever the field held.
 * Each round first runs one ListOffsets that succeeds, whose worker frees its result event; the next
 * worker is allocated in that same heap slot and inherits the stale pointer. An addon without the fix
 * aborts with "double free or corruption" or "free(): invalid pointer"; a fixed one prints `ok`.
 *
 *   PROBE_BROKERS=127.0.0.1:9092 PROBE_TOPIC=<existing topic> bun scripts/probeAdminListOffsets.ts
 */
import { CONFLUENT_PACKAGE } from "../src/native/nativePackage.js";

const brokers = process.env.PROBE_BROKERS;
const topic = process.env.PROBE_TOPIC;
if (!brokers || !topic)
	throw new Error("PROBE_BROKERS and PROBE_TOPIC are required");
const rounds = Number(process.env.PROBE_ROUNDS ?? 200);

type NativeAdmin = {
	listOffsets(
		partitions: {
			topic: string;
			partition: number;
			offset: { timestamp: number };
		}[],
		options: { timeout: number; isolationLevel: number },
		callback: (error: { code: number } | null, offsets?: unknown) => void,
	): void;
};
type AdminClient = {
	_client: NativeAdmin & { disconnect(): unknown };
	disconnect(): void;
};
const confluent = require(CONFLUENT_PACKAGE) as {
	AdminClient: { create(conf: object): AdminClient };
};

const conf = { "bootstrap.servers": brokers, log_level: 3 };
const connected = confluent.AdminClient.create(conf);
// Disconnected underneath the JS wrapper, as a call racing a disconnect sees it: IsConnected() is false.
const unconnected = confluent.AdminClient.create(conf);
unconnected._client.disconnect();
const latest = [{ topic, partition: 0, offset: { timestamp: -1 } }];
const options = { timeout: 5_000, isolationLevel: 0 };

function listOffsets(admin: AdminClient): Promise<number> {
	return new Promise((resolve) =>
		admin._client.listOffsets(latest, options, (error) =>
			resolve(error?.code ?? 0),
		),
	);
}

const codes: Record<number, number> = {};
for (let round = 0; round < rounds; round++) {
	const okCode = await listOffsets(connected);
	if (okCode !== 0) throw new Error(`the connected admin failed: ${okCode}`);
	const code = await listOffsets(unconnected);
	codes[code] = (codes[code] ?? 0) + 1;
	Bun.gc(true);
}
connected.disconnect();
console.log(`ok: ${rounds} rounds, unconnected codes ${JSON.stringify(codes)}`);
process.exit(0);
