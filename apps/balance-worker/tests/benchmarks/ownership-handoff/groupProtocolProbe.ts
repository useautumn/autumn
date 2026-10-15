/**
 * What a fleet does against a broker without KIP-848 (group.version=0): one worker, the routing client's
 * ownership consumer, a herald-style job and a bare group consumer boot against fresh topics; every librdkafka
 * line, consumer event and worker event is timestamped to stdout for PROBE_MS.
 *
 *   KAFKA_BROKERS=... DATABASE_URL=... NODE_ENV=test bun tests/benchmarks/ownership-handoff/groupProtocolProbe.ts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY,
	defaultSubjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	type Consumer,
	createConsumerGroupConfig,
	createOwnershipConsumer,
} from "@autumn/kafka";
import { createTestKafka } from "../../fixtures/testKafka.js";

const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const PARTITIONS = 4;
const PROBE_MS = Number(process.env.PROBE_MS ?? 90_000);
const t0 = Date.now();
function note(who: string, event: string, fields: object = {}): void {
	console.log(JSON.stringify({ rel: Date.now() - t0, who, event, ...fields }));
}

const deployment = `probe-${crypto.randomUUID().slice(0, 8)}`;
const topics = {
	metering: `${deployment}-events`,
	ownership: `${deployment}-ownership`,
	commands: `${deployment}-commands`,
	catalog: `${deployment}-catalog-invalidations`,
};
const kafka = createTestKafka({ clientId: deployment, brokers });
const admin = kafka.admin();
await admin.connect();
await admin.createTopics({
	topics: [
		{ topic: topics.metering, numPartitions: PARTITIONS, replicationFactor: 2 },
		{ topic: topics.commands, numPartitions: PARTITIONS, replicationFactor: 2 },
		{
			topic: topics.ownership,
			numPartitions: PARTITIONS,
			replicationFactor: 2,
			configEntries: [{ name: "cleanup.policy", value: "compact" }],
		},
		{ topic: topics.catalog, numPartitions: 1, replicationFactor: 2 },
	],
});
note("probe", "topics.created");

function watch(consumer: Consumer, who: string): void {
	consumer.on(consumer.events.CRASH, (e) =>
		note(who, "consumer.crash", {
			restart: e.payload.restart,
			error: String(e.payload.error),
			code: (e.payload.error as { code?: unknown }).code,
		}),
	);
	consumer.on(consumer.events.GROUP_JOIN, (e) =>
		note(who, "consumer.group_join", {
			assignment: e.payload.memberAssignment,
		}),
	);
	consumer.on(consumer.events.FETCH, () => undefined);
}

// A bare group consumer on the metering topic, configured the way every group of ours is.
const bare = kafka.consumer(
	createConsumerGroupConfig({
		groupId: `${deployment}-bare`,
		timings: {
			fetchMaxWaitTimeMs: 250,
			heartbeatIntervalMs: 3000,
			rebalanceTimeoutMs: 60000,
			sessionTimeoutMs: 30000,
		},
	}),
);
watch(bare, "bare");
await bare.connect();
await bare.subscribe({ topics: [topics.metering], fromBeginning: true });
await bare.run({ eachMessage: async () => undefined });
note("bare", "running");

// The herald shape: uniform dealing.
const herald = kafka.consumer(
	createConsumerGroupConfig({
		groupId: `${deployment}-herald`,
		timings: {
			fetchMaxWaitTimeMs: 250,
			heartbeatIntervalMs: 3000,
			rebalanceTimeoutMs: 60000,
			sessionTimeoutMs: 30000,
		},
		remoteAssignor: "uniform",
	}),
);
watch(herald, "herald");
await herald.connect();
await herald.subscribe({ topics: [topics.metering], fromBeginning: true });
await herald.run({ eachMessage: async () => undefined });
note("herald", "running");

// The routing client: its start resolves only once it has caught up on the ownership log.
const routingKafka = {
	producer: (...args: Parameters<typeof kafka.producer>) =>
		kafka.producer(...args),
	admin: () => kafka.admin(),
	consumer(config: Parameters<typeof kafka.consumer>[0]) {
		const consumer = kafka.consumer(config);
		watch(consumer, "routing");
		return consumer;
	},
};
const routing = createOwnershipConsumer({
	ctx: {
		kafka: routingKafka,
		onFailed: ({ cause }) =>
			note("routing", "routing.failed", { error: String(cause) }),
	},
	config: { topic: topics.ownership },
});
const routingStarted = routing.start().then(
	() => note("routing", "routing.started"),
	(cause) => note("routing", "routing.start_failed", { error: String(cause) }),
);

// One worker, exactly as the leader-churn harness spawns it.
async function reservePort(): Promise<number> {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Response(),
	});
	const port = server.port;
	await server.stop();
	if (port === undefined) throw new Error("No port");
	return port;
}
const port = await reservePort();
const dir = mkdtempSync(join(tmpdir(), "probe-worker-"));
const env = {
	...createBalanceWorkerEnv({
		DATABASE_URL: databaseUrl,
		KAFKA_BROKERS: brokers.join(","),
		KAFKA_AUTH_MODE: "none",
		BALANCE_WORKER_HOST: "127.0.0.1",
		BALANCE_WORKER_PORT: String(port),
		BALANCE_WORKER_SQLITE_PATH: join(dir, "state.sqlite"),
		BALANCE_WORKER_DEPLOYMENT: deployment,
		BALANCE_WORKER_PARTITION_COUNT: String(PARTITIONS),
	}),
	BENCH_NAME: "W",
	BENCH_BACKEND: "postgres",
};
const edgeConfigOverride = Buffer.from(
	JSON.stringify({
		[BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY]: {
			...defaultSubjectSnapshotsEdgeConfig(),
			mode: "off",
		},
	}),
).toString("base64");
const { AUTUMN_EDGE_CONFIG_OVERRIDE_B64: _, ...inherited } = process.env;
const worker = Bun.spawn(
	["bun", new URL("./benchWorker.ts", import.meta.url).pathname],
	{
		env: {
			...inherited,
			NODE_ENV: "test",
			AUTUMN_EDGE_CONFIG_OVERRIDE_B64: edgeConfigOverride,
			BENCH_WORKER_ENV: JSON.stringify(env),
		},
		stdout: "pipe",
		stderr: "pipe",
	},
);
note("worker", "spawned", { pid: worker.pid });
void worker.exited.then((exitCode) => note("worker", "exited", { exitCode }));
async function pipe(stream: ReadableStream<Uint8Array>, kind: string) {
	let buffered = "";
	for await (const chunk of stream) {
		buffered += new TextDecoder().decode(chunk);
		const lines = buffered.split("\n");
		buffered = lines.pop() ?? "";
		for (const line of lines)
			if (line) note("worker", kind, { line: line.slice(0, 1500) });
	}
}
void pipe(worker.stdout as ReadableStream<Uint8Array>, "stdout");
void pipe(worker.stderr as ReadableStream<Uint8Array>, "stderr");

await Promise.race([routingStarted, Bun.sleep(PROBE_MS)]);
await Bun.sleep(Math.max(0, t0 + PROBE_MS - Date.now()));
note("probe", "done", {
	workerAlive: worker.exitCode === null,
	worker: await fetch(`http://127.0.0.1:${port}/health`)
		.then((r) => r.status)
		.catch((cause) => String(cause)),
});
worker.kill("SIGTERM");
await Promise.race([worker.exited, Bun.sleep(15_000)]);
worker.kill("SIGKILL");
rmSync(dir, { recursive: true, force: true });
await Promise.allSettled([
	routing.stop(),
	bare.disconnect(),
	herald.disconnect(),
]);
await admin.deleteTopics({ topics: Object.values(topics) });
await admin.disconnect();
process.exit(0);
