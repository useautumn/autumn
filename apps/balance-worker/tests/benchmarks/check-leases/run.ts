import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { CheckCommand, TrackCommand } from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	createBalanceWorkerClient,
	type HttpRequest,
	type HttpResponse,
	type SharedCheckLeases,
} from "@autumn/balance-worker-client";
import { testOrg } from "../../fixtures/mutations.js";
import {
	benchIdentityOf,
	createBenchCheckCommand,
} from "../check-throughput/createCheckBench.js";
import { scenarios } from "../track-throughput/scenarios.js";

/**
 * The hot docs-org pattern from 40 server lanes: one (entity, feature, required balance) checked by every lane,
 * against the owner's real Hono app on its own core. Each lane is its own client, so leases are per lane as on
 * the fleet. Reports owner requests/s, owner CPU and lane latency with leases on and off.
 *
 *   --mode=open    each lane offers `--rate` checks/s for `--seconds` (prod: 40 lanes × ~20/s)
 *   --mode=closed  each lane keeps `--concurrency` checks in flight for `--seconds`
 *   --trackShare   that fraction of each lane's operations are tracks (value 1), which end the lane's leases
 *   --keys         checks spread over this many entities (staging's long tail: most keys ask 2–8 times a second)
 *   --shared       on: lanes share leased replies through one in-memory store, as servers do through Redis
 */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const scenarioName = args.scenario ?? "typical";
const scenario = scenarios[scenarioName];
if (!scenario) throw new Error(`Unknown scenario ${scenarioName}`);
const mode = args.mode ?? "open";
const lanes = Number(args.lanes ?? 40);
const rate = Number(args.rate ?? 20);
const concurrency = Number(args.concurrency ?? 2);
const seconds = Number(args.seconds ?? 10);
const trackShare = Number(args.trackShare ?? 0);
const leases = (args.leases ?? "on") === "on";
const serverCore = args.serverCore ?? "1";
const clientCores = args.clientCores ?? "2,3";
const keys = Number(args.keys ?? 1);
const sharesLeases = (args.shared ?? "off") === "on";
const identities = Array.from({ length: keys }, (_, i) =>
	benchIdentityOf({ entityId: `ent_${i}` }),
);
const featureId = scenario.features[0];
if (!featureId) throw new Error("bench fixture");

const readReadyPort = async ({
	stream,
}: {
	stream: ReadableStream<Uint8Array>;
}): Promise<number> => {
	const decoder = new TextDecoder();
	let seen = "";
	for await (const chunk of stream) {
		seen += decoder.decode(chunk);
		const match = seen.match(/READY (\d+)/);
		if (match) return Number(match[1]);
	}
	throw new Error(`bench server exited: ${seen}`);
};

Bun.spawnSync(["taskset", "-p", "-c", clientCores, String(process.pid)]);
const server = Bun.spawn(
	[
		"taskset",
		"-c",
		serverCore,
		process.execPath,
		"--config=./bunfig.toml",
		`${import.meta.dir}/../check-throughput/serveCheckBench.ts`,
	],
	{
		env: { ...process.env, CHECK_BENCH_SCENARIO: scenarioName },
		stdout: "ignore",
		stderr: "pipe",
	},
);
const port = await readReadyPort({ stream: server.stderr });
const ownerCpuMicros = () => {
	const fields = readFileSync(`/proc/${server.pid}/stat`, "utf8")
		.split(") ")[1]
		?.split(" ");
	return ((Number(fields?.[11]) + Number(fields?.[12])) / 100) * 1_000_000;
};

const ownerRequests = { check: 0, track: 0 };
async function postJson(request: HttpRequest): Promise<HttpResponse> {
	if (request.url.endsWith("/v1/check")) ownerRequests.check++;
	else ownerRequests.track++;
	const response = await fetch(request.url, {
		method: "POST",
		headers: { "content-type": "application/json", ...request.headers },
		body: JSON.stringify(request.body),
		signal: request.signal,
	});
	return { status: response.status, body: await response.json() };
}

/** Redis stand-in: values with a remaining life, read and written after a sub-millisecond hop. */
const sharedEntries = new Map<string, { value: string; expiresAt: number }>();
const sharedStore: SharedCheckLeases = {
	read: async ({ key }) => {
		await Bun.sleep(0.3);
		const entry = sharedEntries.get(key);
		if (!entry || entry.expiresAt <= Date.now()) return null;
		return { value: entry.value, ttlMs: entry.expiresAt - Date.now() };
	},
	write: async ({ key, value, ttlMs }) => {
		sharedEntries.set(key, { value, expiresAt: Date.now() + ttlMs });
	},
};

const owner = {
	partition: 0,
	routeEpoch: "1",
	endpoint: `http://127.0.0.1:${port}`,
};
const clients: BalanceWorkerClient[] = Array.from({ length: lanes }, () =>
	createBalanceWorkerClient({
		ctx: {
			owners: { findOwner: () => owner, refresh: async () => undefined },
			http: { postJson },
			...(sharesLeases && { sharedCheckLeases: sharedStore }),
		},
		config: {
			partitionCount: 1,
			timeoutMs: 5_000,
			batchTracks: false,
			...(leases && { checkLeases: { maxEntries: 20_000 } }),
		},
	}),
);

let sequence = 0;
const randomIdentity = () => {
	const identity = identities[Math.floor(Math.random() * identities.length)];
	if (!identity) throw new Error("bench fixture");
	return identity;
};
const checkCommand = (): CheckCommand => {
	const n = sequence++;
	return createBenchCheckCommand({
		identity: randomIdentity(),
		featureId,
		sequence: n,
	});
};
const trackCommand = (): TrackCommand => {
	const n = sequence++;
	const identity = randomIdentity();
	return {
		schemaVersion: 1,
		type: "track",
		org: testOrg,
		commandId: `bench_track_${n}`,
		requestId: `req_track_${n}`,
		identity,
		featureId,
		internalFeatureId: `feat_${featureId}`,
		value: 1,
		overageBehavior: "reject",
		properties: null,
		usageEvent: { name: featureId, idempotencyKey: null, id: null },
		occurredAt: Date.now(),
	};
};

const latencies: number[] = [];
const answered = { check: 0, track: 0 };
async function operate(client: BalanceWorkerClient): Promise<void> {
	const started = performance.now();
	if (Math.random() < trackShare) {
		await client.track({ command: trackCommand() });
		answered.track++;
	} else {
		const reply = await client.check({ command: checkCommand() });
		if (!reply.result.allowed) throw new Error("bench check refused");
		answered.check++;
		latencies.push(performance.now() - started);
	}
}

async function runOpenLane({
	client,
	until,
}: {
	client: BalanceWorkerClient;
	until: number;
}): Promise<void> {
	const intervalMs = 1_000 / rate;
	// Lanes start spread over one interval, as servers' requests are.
	let next = performance.now() + Math.random() * intervalMs;
	const inFlight: Promise<void>[] = [];
	while (next < until) {
		const wait = next - performance.now();
		if (wait > 0) await Bun.sleep(wait);
		inFlight.push(operate(client));
		next += intervalMs;
	}
	await Promise.all(inFlight);
}

async function runClosedLane({
	client,
	until,
}: {
	client: BalanceWorkerClient;
	until: number;
}): Promise<void> {
	async function loop(): Promise<void> {
		while (performance.now() < until) await operate(client);
	}
	await Promise.all(Array.from({ length: concurrency }, loop));
}

const runLane = mode === "closed" ? runClosedLane : runOpenLane;
async function runPhase({ ms }: { ms: number }): Promise<void> {
	const until = performance.now() + ms;
	await Promise.all(clients.map((client) => runLane({ client, until })));
}

// Warm the owner's subject, entity and JIT before measuring.
await runPhase({ ms: 3_000 });
latencies.length = 0;
answered.check = 0;
answered.track = 0;
ownerRequests.check = 0;
ownerRequests.track = 0;
const leaseBefore = clients.map((client) => client.readCheckLeaseCounters?.());

const cpuBefore = ownerCpuMicros();
const started = performance.now();
await runPhase({ ms: seconds * 1_000 });
const elapsedS = (performance.now() - started) / 1_000;
const ownerCpuS = (ownerCpuMicros() - cpuBefore) / 1_000_000;
server.kill();

latencies.sort((a, b) => a - b);
const percentile = (p: number) =>
	latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ??
	0;
const leaseTotals = clients.reduce(
	(sum, client, index) => {
		const now = client.readCheckLeaseCounters?.();
		const before = leaseBefore[index];
		if (!now || !before) return sum;
		sum.hit +=
			now.leaseHit -
			before.leaseHit +
			now.leaseSharedHit -
			before.leaseSharedHit;
		sum.miss += now.leaseMiss - before.leaseMiss;
		return sum;
	},
	{ hit: 0, miss: 0 },
);
const checks = answered.check;
console.error(
	JSON.stringify({
		mode,
		leases,
		shared: sharesLeases,
		keys,
		lanes,
		...(mode === "open" ? { ratePerLane: rate } : { concurrency }),
		trackShare,
		seconds: Number(elapsedS.toFixed(1)),
		answeredChecksPerS: Math.round(checks / elapsedS),
		ownerCheckRequestsPerS: Math.round(ownerRequests.check / elapsedS),
		ownerTrackRequestsPerS: Math.round(ownerRequests.track / elapsedS),
		leaseHitShare:
			leaseTotals.hit + leaseTotals.miss > 0
				? Number(
						(leaseTotals.hit / (leaseTotals.hit + leaseTotals.miss)).toFixed(3),
					)
				: 0,
		ownerCpuPercent: Number(((ownerCpuS / elapsedS) * 100).toFixed(1)),
		ownerCpuUsPerAnsweredCheck: Number(
			((ownerCpuS * 1_000_000) / Math.max(checks, 1)).toFixed(1),
		),
		p50Ms: Number(percentile(0.5).toFixed(2)),
		p99Ms: Number(percentile(0.99).toFixed(2)),
	}),
);
process.exit(0);
