import { performance } from "node:perf_hooks";
import type { MeteringIdentity } from "@autumn/balance-engine";
import { WORKER_REQUEST_BUDGET_HEADER } from "@autumn/balance-worker-client/protocol";
import { createTrackCommand, testIdentity } from "../../fixtures/mutations.js";
import { createBenchCheckCommand } from "../check-throughput/createCheckBench.js";
import { scenarios } from "../track-throughput/scenarios.js";

/**
 * One task on a socket (pinned to its own core), one hot customer bursting past what it can serve, and
 * quiet customers beside it. Open loop from a client on another core: every request is sent on schedule
 * and its caller gives up after `budgetMs` (fails open), as the server's client does. Arms alternate per run.
 *
 *   bun run benchmark:deadline-shed -- --hotChecks=4000 --runs=3
 *
 * Reports what one hot customer costs everyone else: the quiet customers' p99 and fail-open rate during
 * the burst. Logs go to stdout, the result table to stderr.
 */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const budgetMs = Number(args.budgetMs ?? 1_000);
const quietCustomers = Number(args.quietCustomers ?? 20);
const quietChecksPerSecond = Number(args.quietChecks ?? 20);
const quietTracksPerSecond = Number(args.quietTracks ?? 5);
const hotChecksPerSecond = Number(args.hotChecks ?? 4_000);
const hotTracksPerSecond = Number(args.hotTracks ?? 200);
const seconds = Number(args.seconds ?? 12);
const burstFrom = Number(args.burstFrom ?? 2) * 1_000;
const burstTo = Number(args.burstTo ?? 8) * 1_000;
const runs = Number(args.runs ?? 3);
const arms = (args.arms ?? "A,B").split(",");
const serverCore = args.serverCore ?? "1";
const clientCores = args.clientCores ?? "0";

const scenario = scenarios.typical;
if (!scenario) throw new Error("bench fixture");
const featureId = scenario.features[0] ?? "feature_0";
const customerOf = (customerId: string): MeteringIdentity => ({
	...testIdentity,
	customerId,
	entityId: null,
});

type Kind = "check" | "track";
type Outcome = "ok" | "late" | "shed" | "dropped" | "error";
type Sample = {
	hot: boolean;
	kind: Kind;
	sentAt: number;
	outcome: Outcome;
	latencyMs: number;
};
type Stream = {
	identity: MeteringIdentity;
	hot: boolean;
	kind: Kind;
	perSecond: number;
	from: number;
	to: number;
	sent: number;
};

const startServer = async ({ arm }: { arm: string }) => {
	const server = Bun.spawn(
		[
			"taskset",
			"-c",
			serverCore,
			process.execPath,
			"--config=./bunfig.toml",
			`${import.meta.dir}/serveDeadlineShed.ts`,
		],
		{
			env: {
				...process.env,
				NODE_ENV: "production",
				DEADLINE_SHED_ARM: arm,
				DEADLINE_SHED_QUIET: String(quietCustomers),
			},
			stdout: "ignore",
			stderr: "pipe",
		},
	);
	const reader = server.stderr.getReader();
	let text = "";
	while (!/READY (\d+)/.test(text)) {
		const { value, done } = await reader.read();
		if (done) throw new Error(`server exited: ${text}`);
		text += new TextDecoder().decode(value);
	}
	reader.releaseLock();
	void server.stderr.pipeTo(new WritableStream());
	return { server, port: Number(/READY (\d+)/.exec(text)?.[1]) };
};

const runOnce = async ({ arm }: { arm: string }) => {
	const { server, port } = await startServer({ arm });
	const samples: Sample[] = [];
	let sequence = 0;

	function send({ stream, sentAt }: { stream: Stream; sentAt: number }) {
		const n = sequence++;
		const command =
			stream.kind === "check"
				? createBenchCheckCommand({
						identity: stream.identity,
						featureId,
						sequence: n,
					})
				: createTrackCommand({
						identity: stream.identity,
						commandId: `t_${n}`,
						featureId,
						value: 1,
					});
		const record = (outcome: Outcome) =>
			samples.push({
				hot: stream.hot,
				kind: stream.kind,
				sentAt,
				outcome,
				latencyMs: performance.now() - sentAt,
			});
		const remainingMs = sentAt + budgetMs - performance.now();
		if (remainingMs <= 0) return record("late");
		fetch(`http://127.0.0.1:${port}/v1/${stream.kind}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[WORKER_REQUEST_BUDGET_HEADER]: String(Math.floor(remainingMs)),
			},
			body: JSON.stringify({
				route: { partition: 0, routeEpoch: "1" },
				command,
			}),
			signal: AbortSignal.timeout(Math.ceil(remainingMs)),
		}).then(
			async (response) => {
				await response.arrayBuffer();
				if (response.status === 200)
					record(performance.now() - sentAt > budgetMs ? "late" : "ok");
				else if (response.status === 429) record("shed");
				else if (response.status === 503) record("dropped");
				else record("error");
			},
			() => record("late"),
		);
	}

	const streams: Stream[] = [
		...Array.from({ length: quietCustomers }, (_, index) =>
			customerOf(`cus_quiet_${index}`),
		).flatMap((identity, index): Stream[] => [
			{
				identity,
				hot: false,
				kind: "check",
				perSecond: quietChecksPerSecond,
				from: index,
				to: seconds * 1_000,
				sent: 0,
			},
			{
				identity,
				hot: false,
				kind: "track",
				perSecond: quietTracksPerSecond,
				from: index,
				to: seconds * 1_000,
				sent: 0,
			},
		]),
		...(["check", "track"] as const).map(
			(kind): Stream => ({
				identity: customerOf("cus_hot"),
				hot: true,
				kind,
				perSecond: kind === "check" ? hotChecksPerSecond : hotTracksPerSecond,
				from: burstFrom,
				to: burstTo,
				sent: 0,
			}),
		),
	];

	const startedAt = performance.now();
	/** Sends every request whose time has come, stamped with its scheduled time, not with when it went. */
	function pump(): void {
		const elapsed = performance.now() - startedAt;
		for (const stream of streams) {
			const due = Math.floor(
				((Math.min(elapsed, stream.to) - stream.from) * stream.perSecond) /
					1_000,
			);
			while (stream.sent < due) {
				stream.sent++;
				send({
					stream,
					sentAt:
						startedAt + stream.from + (stream.sent * 1_000) / stream.perSecond,
				});
			}
		}
	}
	const pumpTimer = setInterval(pump, 1);
	await Bun.sleep(seconds * 1_000);
	clearInterval(pumpTimer);
	pump();
	const sentTotal = streams.reduce((sum, stream) => sum + stream.sent, 0);
	const drainBy = performance.now() + budgetMs + 5_000;
	while (samples.length < sentTotal && performance.now() < drainBy)
		await Bun.sleep(50);
	const admission = await fetch(`http://127.0.0.1:${port}/bench-stats`)
		.then((response) => response.json())
		.catch(() => null);
	server.kill();
	await server.exited;

	const inBurst = (sample: Sample) =>
		sample.sentAt - startedAt >= burstFrom &&
		sample.sentAt - startedAt < burstTo;
	const quietInBurst = samples.filter((s) => !s.hot && inBurst(s));
	return {
		arm,
		unanswered: sentTotal - samples.length,
		quietInBurst: summarise(quietInBurst),
		quietChecksInBurst: summarise(
			quietInBurst.filter((s) => s.kind === "check"),
		),
		quietTracksInBurst: summarise(
			quietInBurst.filter((s) => s.kind === "track"),
		),
		quietAfterBurst: summarise(
			samples.filter((s) => !s.hot && s.sentAt - startedAt >= burstTo),
		),
		hotChecks: summarise(samples.filter((s) => s.hot && s.kind === "check")),
		hotTracks: summarise(samples.filter((s) => s.hot && s.kind === "track")),
		admission,
	};
};

const percentile = (values: number[], p: number) => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const at = Math.min(
		sorted.length - 1,
		Math.ceil((p / 100) * sorted.length) - 1,
	);
	return Math.round((sorted[at] ?? 0) * 10) / 10;
};
/** What a caller saw: an answer in budget, or a fail-open at the budget (late, shed or dropped). */
const summarise = (group: Sample[]) => {
	const counts = { ok: 0, late: 0, shed: 0, dropped: 0, error: 0 };
	for (const sample of group) counts[sample.outcome]++;
	const seen = group.map((sample) =>
		sample.outcome === "ok" ? sample.latencyMs : budgetMs,
	);
	return {
		n: group.length,
		...counts,
		failOpenPct:
			group.length === 0
				? 0
				: Math.round(((group.length - counts.ok) / group.length) * 1_000) / 10,
		p50Ms: percentile(seen, 50),
		p99Ms: percentile(seen, 99),
	};
};

Bun.spawnSync(["taskset", "-p", "-c", clientCores, String(process.pid)]);
const results: Awaited<ReturnType<typeof runOnce>>[] = [];
for (let run = 0; run < runs; run++)
	for (const arm of arms) {
		const result = await runOnce({ arm });
		console.log(JSON.stringify({ run, ...result }));
		results.push(result);
	}

const median = (values: (number | null)[]) => {
	const sorted = values
		.filter((value): value is number => value !== null)
		.sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? null;
};
const table = arms.map((arm) => {
	const mine = results.filter((result) => result.arm === arm);
	return {
		arm,
		quietP50Ms: median(mine.map((r) => r.quietInBurst.p50Ms)),
		quietP99Ms: median(mine.map((r) => r.quietInBurst.p99Ms)),
		quietFailOpenPct: median(mine.map((r) => r.quietInBurst.failOpenPct)),
		quietCheckP99Ms: median(mine.map((r) => r.quietChecksInBurst.p99Ms)),
		quietTrackP99Ms: median(mine.map((r) => r.quietTracksInBurst.p99Ms)),
		quietAfterP99Ms: median(mine.map((r) => r.quietAfterBurst.p99Ms)),
		hotCheckOkPct: median(mine.map((r) => 100 - r.hotChecks.failOpenPct)),
		hotTrackOkPct: median(mine.map((r) => 100 - r.hotTracks.failOpenPct)),
	};
});
console.error(
	JSON.stringify({
		config: {
			budgetMs,
			quietCustomers,
			quietChecksPerSecond,
			quietTracksPerSecond,
			hotChecksPerSecond,
			hotTracksPerSecond,
			burst: [burstFrom / 1_000, burstTo / 1_000],
			runs,
		},
		table,
	}),
);
process.exit(0);
