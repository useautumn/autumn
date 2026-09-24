/**
 * Multi-process proof for the edge config relay + Redis change marker.
 *
 * Runs the REAL edge config modules in a real node:cluster (1 primary, 4 forks)
 * against a fake path-style S3 (Bun.serve) and the local Dragonfly, once with
 * the baseline modules from `--base` (default HEAD, i.e. before the uncommitted
 * change) and once with the working tree, and prints S3 GETs/min, propagation
 * latency, lost-Redis-bump propagation, SWR under a 503 outage, fork respawn
 * cost and blue-green slot flip latency.
 *
 * Usage (from server/): bun perf/edgeConfigProof/runEdgeConfigProof.ts
 *   [--modes old,new] [--base <git ref>] [--log /tmp/edge-config-proof.log]
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Redis } from "ioredis";
import { z } from "zod/v4";
import { startFakeS3 } from "./fakeS3.js";

const PORT = 45870;
const BUCKET = "edge-config-proof";
const REDIS_URL = "redis://127.0.0.1:6379/9";
const FORKS = 4;
const CONFIG_KEYS = Array.from(
	{ length: 20 },
	(_, i) => `admin/proof/config-${String(i).padStart(2, "0")}.json`,
);
const PROBE_KEY = CONFIG_KEYS[0]!;
const TIMESTAMP_KEY = "admin/edge-config-timestamp.json";
const SLOT_KEY = "admin/blue-green-active-slot.json";
const REDIS_MARKER_KEY = "edge-config:version";

const args = process.argv.slice(2);
const argValue = (name: string, fallback: string) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};
const logPath = argValue("log", "/tmp/edge-config-proof.log");
const serverDir = path.resolve(import.meta.dir, "../..");
const newModulesDir = path.join(serverDir, "src/internal/misc/edgeConfig");
const baselineDir = path.join(import.meta.dir, ".baseline");

// Bun.S3Client reads S3_* env once at process start, and the repo's preload
// overrides env from .env.local, so the proof re-execs itself with a clean env.
if (process.env.EDGE_PROOF_CHILD !== "1") {
	const proof = Bun.spawn([process.execPath, import.meta.path, ...args], {
		cwd: serverDir,
		env: {
			...process.env,
			EDGE_PROOF_CHILD: "1",
			PW_MODE: "1",
			ENV_FILE: ".env.edge-config-proof-none",
			NODE_ENV: "production",
			S3_ENDPOINT: `http://127.0.0.1:${PORT}`,
			S3_ACCESS_KEY_ID: "proof",
			S3_SECRET_ACCESS_KEY: "proof-secret",
			S3_BUCKET: BUCKET,
			S3_REGION: "us-east-2",
			AWS_ACCESS_KEY_ID: "proof",
			AWS_SECRET_ACCESS_KEY: "proof-secret",
			AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "",
			AWS_CONTAINER_CREDENTIALS_FULL_URI: "",
			MISC_CACHE_DRAGONFLY_PUBLIC_URL: REDIS_URL,
			MISC_CACHE_DRAGONFLY_PRIVATE_URL: "",
			AUTUMN_EDGE_CONFIG_RELAY: "",
			AUTUMN_EDGE_CONFIG_OVERRIDE_B64: "",
		},
		stdout: "pipe",
		stderr: "inherit",
	});
	const log = Bun.file(logPath).writer();
	const decoder = new TextDecoder();
	for await (const chunk of proof.stdout) {
		process.stdout.write(chunk);
		log.write(decoder.decode(chunk));
	}
	await log.end();
	process.exit(await proof.exited);
}

type StoreModule =
	typeof import("@/internal/misc/edgeConfig/edgeConfigStore.js");

const modes = argValue("modes", "old,new").split(",") as ("old" | "new")[];
const baseRef = argValue("base", "HEAD");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line = "") => console.log(line);
const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};
const fmtMs = (value: number | null) =>
	value === null ? "TIMEOUT" : `${(value / 1000).toFixed(2)}s`;

const extractBaseline = () => {
	rmSync(baselineDir, { recursive: true, force: true });
	mkdirSync(baselineDir, { recursive: true });
	for (const file of [
		"edgeConfigRegistry.ts",
		"edgeConfigStore.ts",
		"edgeConfigTimestamp.ts",
	]) {
		const source = Bun.spawnSync([
			"git",
			"show",
			`${baseRef}:server/src/internal/misc/edgeConfig/${file}`,
		]);
		if (source.exitCode !== 0) {
			throw new Error(`git show ${baseRef} ${file}: ${source.stderr}`);
		}
		writeFileSync(path.join(baselineDir, file), source.stdout);
	}
};

const fakeS3 = startFakeS3({ port: PORT, bucket: BUCKET });
const redis = new Redis(REDIS_URL);

const timestampBody = (tag: string) =>
	JSON.stringify({ updatedAt: new Date().toISOString(), changeId: tag });
const slotBody = (arn: string) =>
	JSON.stringify({
		activeTaskDefinitionArn: arn,
		activeImageSha: arn,
		updatedAt: new Date().toISOString(),
	});

const seedBucket = () => {
	fakeS3.reset();
	for (const key of CONFIG_KEYS) {
		fakeS3.putObject({ key, body: JSON.stringify({ value: "v0" }) });
	}
	fakeS3.putObject({ key: TIMESTAMP_KEY, body: timestampBody("seed") });
	fakeS3.putObject({ key: SLOT_KEY, body: slotBody("arn:blue") });
};

const waitFor = async ({
	predicate,
	timeoutMs,
}: {
	predicate: () => boolean;
	timeoutMs: number;
}): Promise<number | null> => {
	const startedAt = performance.now();
	while (performance.now() - startedAt < timeoutMs) {
		if (predicate()) return performance.now() - startedAt;
		await sleep(20);
	}
	return null;
};

const allForksServe = (
	check: (report: { probe: string; slot: string | null }) => boolean,
) => {
	const live = fakeS3.liveReports();
	return live.length === FORKS && live.every(check);
};

const diffGets = ({
	before,
	after,
}: {
	before: Map<string, number>;
	after: Map<string, number>;
}) => {
	const diff = new Map<string, number>();
	for (const [key, count] of after) {
		const delta = count - (before.get(key) ?? 0);
		if (delta > 0) diff.set(key, delta);
	}
	return diff;
};

const summarizeGets = (gets: Map<string, number>) => {
	let config = 0;
	let other = 0;
	for (const [key, count] of gets) {
		if (CONFIG_KEYS.includes(key)) config += count;
		else if (key !== TIMESTAMP_KEY && key !== SLOT_KEY) other += count;
	}
	const timestamp = gets.get(TIMESTAMP_KEY) ?? 0;
	const slot = gets.get(SLOT_KEY) ?? 0;
	return {
		total: config + other + timestamp + slot,
		config,
		timestamp,
		slot,
		other,
	};
};

type ModeResult = {
	getsPerMinute: ReturnType<typeof summarizeGets>;
	propagation: (number | null)[];
	lostBump: number | null;
	swr: {
		samples: number;
		wrongValueSamples: number;
		defaultValueSamples: number;
		unhealthySamples: number;
		getsDuringOutage: number;
		recovery: number | null;
	};
	respawn: { ready: number | null; configGets: number };
	slotFlip: (number | null)[];
};

const runMode = async (mode: "old" | "new"): Promise<ModeResult> => {
	const modulesDir = mode === "old" ? baselineDir : newModulesDir;
	log(
		`\n=== ${mode.toUpperCase()} (${mode === "old" ? `${baseRef} modules` : "working tree"}) ===`,
	);
	seedBucket();
	await redis.del(REDIS_MARKER_KEY);

	const { createEdgeConfigStore } = (await import(
		`${modulesDir}/edgeConfigStore.ts`
	)) as StoreModule;
	// The admin write path: this mode's store writeToSource (config PUT +
	// timestamp PUT, plus the Redis bump in "new").
	const probeWriter = createEdgeConfigStore({
		s3Key: PROBE_KEY,
		schema: z.object({ value: z.string() }),
		defaultValue: () => ({ value: "default" }),
	});

	const clusterLogPath = `/tmp/edge-config-proof-cluster-${mode}.log`;
	const clusterLog = Bun.file(clusterLogPath);
	const primary = Bun.spawn(
		[process.execPath, path.join(import.meta.dir, "proofCluster.ts")],
		{
			cwd: serverDir,
			env: {
				...process.env,
				EDGE_PROOF_MODE: mode,
				EDGE_PROOF_MODULES_DIR: modulesDir,
				EDGE_PROOF_REPORT_URL: `http://127.0.0.1:${PORT}/__report`,
				EDGE_PROOF_FORKS: String(FORKS),
				EDGE_PROOF_CONFIG_KEYS: CONFIG_KEYS.join(","),
			},
			stdout: clusterLog,
			stderr: clusterLog,
		},
	);
	const seenPids = new Set<number>();
	const trackPids = setInterval(() => {
		for (const report of fakeS3.liveReports()) seenPids.add(report.pid);
	}, 100);

	try {
		const booted = await waitFor({
			predicate: () =>
				allForksServe(
					({ probe, slot }) => probe === "v0" && slot === "arn:blue",
				),
			timeoutMs: 60_000,
		});
		log(
			`boot: all ${FORKS} forks serving seeded config after ${fmtMs(booted)}`,
		);
		if (booted === null)
			throw new Error(`cluster never booted; see ${clusterLogPath}`);

		// (a) steady-state GETs over one minute
		await sleep(3_000);
		const steadyBefore = fakeS3.snapshotGets().ok;
		await sleep(60_000);
		const steadyGets = diffGets({
			before: steadyBefore,
			after: fakeS3.snapshotGets().ok,
		});
		const getsPerMinute = summarizeGets(steadyGets);
		log(
			`(a) S3 GETs in 60s steady state: total=${getsPerMinute.total} timestamp=${getsPerMinute.timestamp} slot=${getsPerMinute.slot} configs=${getsPerMinute.config} other=${getsPerMinute.other}`,
		);
		log(
			`    per key: ${[...steadyGets].map(([key, count]) => `${key.replace("admin/", "")}=${count}`).join(" ")}`,
		);

		// (b) propagation after writeToSource, 5 trials
		const propagation: (number | null)[] = [];
		for (let trial = 1; trial <= 5; trial++) {
			await sleep(500 + Math.random() * 2_000);
			const value = `b-${mode}-${trial}`;
			const startedAt = performance.now();
			await probeWriter.writeToSource({ config: { value } });
			const settled = await waitFor({
				predicate: () => allForksServe(({ probe }) => probe === value),
				timeoutMs: 30_000,
			});
			const latency = settled === null ? null : performance.now() - startedAt;
			propagation.push(latency);
			log(
				`(b) trial ${trial}: all forks on "${value}" after ${fmtMs(latency)}`,
			);
		}

		// (c) config + timestamp land, Redis bump lost
		const lostValue = `c-${mode}`;
		fakeS3.putObject({
			key: PROBE_KEY,
			body: JSON.stringify({ value: lostValue }),
		});
		fakeS3.putObject({
			key: TIMESTAMP_KEY,
			body: timestampBody(`lost-${mode}`),
		});
		const lostBump = await waitFor({
			predicate: () => allForksServe(({ probe }) => probe === lostValue),
			timeoutMs: 120_000,
		});
		log(
			`(c) no Redis bump: all forks on "${lostValue}" after ${fmtMs(lostBump)}`,
		);

		// (d) 30s S3 outage while a change is pending
		const outageBefore = fakeS3.snapshotGets();
		fakeS3.setFailing(true);
		const swrValue = `d-${mode}`;
		fakeS3.putObject({
			key: PROBE_KEY,
			body: JSON.stringify({ value: swrValue }),
		});
		fakeS3.putObject({
			key: TIMESTAMP_KEY,
			body: timestampBody(`swr-${mode}`),
		});
		await redis.set(REDIS_MARKER_KEY, `swr-${mode}-${Date.now()}`);
		const swr = {
			samples: 0,
			wrongValueSamples: 0,
			defaultValueSamples: 0,
			unhealthySamples: 0,
			getsDuringOutage: 0,
			recovery: null as number | null,
		};
		const outageEndsAt = performance.now() + 30_000;
		while (performance.now() < outageEndsAt) {
			for (const report of fakeS3.liveReports()) {
				swr.samples++;
				if (report.probe !== lostValue) swr.wrongValueSamples++;
				if (report.probe === "default") swr.defaultValueSamples++;
				if (!report.probeHealthy) swr.unhealthySamples++;
			}
			await sleep(100);
		}
		fakeS3.setFailing(false);
		const outageAfter = fakeS3.snapshotGets();
		swr.getsDuringOutage = summarizeGets(
			diffGets({ before: outageBefore.failed, after: outageAfter.failed }),
		).total;
		swr.recovery = await waitFor({
			predicate: () => allForksServe(({ probe }) => probe === swrValue),
			timeoutMs: 60_000,
		});
		log(
			`(d) 30s outage: ${swr.samples} fork samples, ${swr.wrongValueSamples} not on last good "${lostValue}", ${swr.defaultValueSamples} on default, ${swr.unhealthySamples} reporting unhealthy; ${swr.getsDuringOutage} GETs hit the 503; recovered to "${swrValue}" ${fmtMs(swr.recovery)} after S3 came back`,
		);

		// (e) kill one fork: the replacement boots from the relay cache
		await sleep(2_000);
		const victim = fakeS3.liveReports()[0]!;
		const pidsBeforeKill = new Set(fakeS3.liveReports().map((r) => r.pid));
		const respawnBefore = fakeS3.snapshotGets().ok;
		process.kill(victim.pid, "SIGKILL");
		const ready = await waitFor({
			predicate: () => {
				const live = fakeS3.liveReports();
				return (
					live.length === FORKS &&
					!live.some((r) => r.pid === victim.pid) &&
					live.some((r) => !pidsBeforeKill.has(r.pid)) &&
					live.every((r) => r.probe === swrValue)
				);
			},
			timeoutMs: 60_000,
		});
		const respawnGets = summarizeGets(
			diffGets({ before: respawnBefore, after: fakeS3.snapshotGets().ok }),
		);
		const respawn = {
			ready,
			configGets:
				respawnGets.config + respawnGets.timestamp + respawnGets.other,
		};
		log(
			`(e) killed fork pid ${victim.pid}: replacement serving "${swrValue}" after ${fmtMs(ready)}; config+timestamp GETs meanwhile=${respawn.configGets} (slot polls=${respawnGets.slot})`,
		);

		// (f) blue-green slot flip, written straight to S3 (no signal)
		const slotFlip: (number | null)[] = [];
		for (let trial = 1; trial <= 3; trial++) {
			await sleep(500 + Math.random() * 1_500);
			const arn = `arn:green-${mode}-${trial}`;
			fakeS3.putObject({ key: SLOT_KEY, body: slotBody(arn) });
			const latency = await waitFor({
				predicate: () => allForksServe(({ slot }) => slot === arn),
				timeoutMs: 30_000,
			});
			slotFlip.push(latency);
			log(
				`(f) slot flip ${trial}: all forks on ${arn} after ${fmtMs(latency)}`,
			);
		}

		return { getsPerMinute, propagation, lostBump, swr, respawn, slotFlip };
	} finally {
		clearInterval(trackPids);
		primary.kill("SIGTERM");
		await Promise.race([primary.exited, sleep(3_000)]);
		for (const pid of seenPids) {
			try {
				process.kill(pid, "SIGKILL");
			} catch {}
		}
		const warnings = (await clusterLog.text())
			.split("\n")
			.filter((line) => line.includes("WARN"));
		log(`cluster log: ${clusterLogPath} (${warnings.length} WARN lines)`);
		for (const line of warnings.slice(0, 5)) log(`    ${line.slice(0, 220)}`);
	}
};

log(
	`edge config proof ${new Date().toISOString()} — ${FORKS} forks, ${CONFIG_KEYS.length} configs, fake S3 ${fakeS3.endpoint}, Redis ${REDIS_URL}`,
);
const results: Partial<Record<"old" | "new", ModeResult>> = {};
try {
	if (modes.includes("old")) extractBaseline();
	for (const mode of modes) results[mode] = await runMode(mode);
} finally {
	rmSync(baselineDir, { recursive: true, force: true });
	await redis.del(REDIS_MARKER_KEY);
	redis.disconnect();
	fakeS3.stop();
}

const row = (label: string, render: (result: ModeResult) => string) =>
	`| ${label} | ${modes.map((mode) => (results[mode] ? render(results[mode]) : "-")).join(" | ")} |`;
const latencies = (values: (number | null)[]) => {
	const settled = values.filter((value): value is number => value !== null);
	const timeouts = values.length - settled.length;
	return `median ${fmtMs(median(settled))}, max ${fmtMs(Math.max(...settled))}${timeouts ? `, ${timeouts} timeouts` : ""}`;
};

log("\n=== SUMMARY (1 task = 1 primary + 4 forks) ===");
log(`| metric | ${modes.join(" | ")} |`);
log(`|---|${modes.map(() => "---").join("|")}|`);
log(
	row(
		"(a) S3 GETs/min steady state",
		(r) =>
			`${r.getsPerMinute.total} (ts ${r.getsPerMinute.timestamp}, slot ${r.getsPerMinute.slot}, configs ${r.getsPerMinute.config})`,
	),
);
log(
	row("(b) writeToSource → all forks (5 trials)", (r) =>
		latencies(r.propagation),
	),
);
log(row("(c) lost Redis bump → all forks", (r) => fmtMs(r.lostBump)));
log(
	row(
		"(d) 30s 503: samples off last-good / on default",
		(r) =>
			`${r.swr.wrongValueSamples}/${r.swr.samples} off, ${r.swr.defaultValueSamples} default`,
	),
);
log(
	row("(d) GETs against the 503 in 30s", (r) => String(r.swr.getsDuringOutage)),
);
log(row("(d) recovery after S3 returns", (r) => fmtMs(r.swr.recovery)));
log(
	row(
		"(e) fork respawn: config GETs / ready",
		(r) => `${r.respawn.configGets} GETs / ${fmtMs(r.respawn.ready)}`,
	),
);
log(row("(f) slot flip → all forks (3 trials)", (r) => latencies(r.slotFlip)));
process.exit(0);
