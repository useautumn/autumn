/**
 * Reads a rig:roll run and prints, per owner class, each second's answered / forwarded (by reason) / failed counts around
 * every swap, with the swap's events as markers, then the gap windows: the first and last second a class saw anything but
 * an answer, and the P1 reconciliation. `bun run rig:rollreport <run dir>`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type OwnerClass, percentileOf, type RollCounts } from "./rigShared.js";
import { detectTwoOwner, type HandIn, swapWindowsOf } from "./rigTwoOwner.js";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: rig:rollreport <run dir>");

type Mark = { type: "mark"; name: string; second: number };
type Second = { type: "second"; second: number; a: RollCounts; b: RollCounts };
const lines = readFileSync(join(dir, "roll.jsonl"), "utf8")
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line) as Mark | Second);
const marks = lines.filter((line): line is Mark => line.type === "mark");
const seconds = lines
	.filter((line): line is Second => line.type === "second")
	.sort((x, y) => x.second - y.second);
const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
// Re-run the detector from the hand-ins, so a run is read with this checkout's detector whatever the box ran.
if (existsSync(join(dir, "handins.json")) && summary.writers) {
	const replicaOfWriter: Record<string, OwnerClass> = Object.fromEntries(
		(["a", "b"] as const).flatMap((replica) =>
			(summary.writers[replica] as string[]).map((writerId) => [
				writerId,
				replica,
			]),
		),
	);
	summary.twoOwner = detectTwoOwner({
		handIns: JSON.parse(
			readFileSync(join(dir, "handins.json"), "utf8"),
		) as HandIn[],
		replicaOfWriter,
		windows: swapWindowsOf({ marks: summary.marks }),
	});
	writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
}

const record = (counts: Record<string, number>) =>
	Object.entries(counts)
		.sort(([, x], [, y]) => y - x)
		.map(([key, n]) => `${key}:${n}`)
		.join(" ");

const notAnswered = (counts: RollCounts) =>
	counts.forwarded +
	Object.values(counts.failedStatus).reduce((sum, n) => sum + n, 0);

/** The seconds a swap spans: from its deregistration to its registration, with a margin either side. */
const swapsOf = () => {
	const swaps: { replica: OwnerClass; from: number; to: number }[] = [];
	for (const replica of ["a", "b"] as const) {
		const named = (name: string) =>
			marks.filter((m) => m.name === `${replica} ${name}`);
		const froms = [...named("deregistered"), ...named("kill9")].sort(
			(x, y) => x.second - y.second,
		);
		const tos = named("registered");
		for (const [k, from] of froms.entries()) {
			const to = tos[k];
			if (to)
				swaps.push({
					replica,
					from: Math.floor(from.second) - 3,
					to: Math.ceil(to.second) + 5,
				});
		}
	}
	return swaps.sort((x, y) => x.from - y.from);
};

const row = (counts: RollCounts) =>
	[
		String(counts.sent).padStart(5),
		String(counts.answered).padStart(5),
		String(counts.forwarded).padStart(4),
		String(
			percentileOf({ histogram: counts.histogram, p: 0.99 }) ?? "-",
		).padStart(7),
		record(counts.forwardReasons),
		record(counts.failedStatus),
		record(counts.proxied),
	].join("  ");

for (const swap of swapsOf()) {
	console.log(
		`\n== swap of ${swap.replica} (seconds ${swap.from}..${swap.to}) ==`,
	);
	console.log(
		"   sec  | A-owned: sent  answ  fwd  p99 ms  forward reasons | failed | proxied || B-owned: the same",
	);
	for (const second of seconds) {
		if (second.second < swap.from || second.second > swap.to) continue;
		for (const m of marks)
			if (Math.floor(m.second) === second.second)
				console.log(
					`        ${m.second.toFixed(1).padStart(7)} s  * ${m.name}`,
				);
		console.log(
			`  ${String(second.second).padStart(4)}  | ${row(second.a)} || ${row(second.b)}`,
		);
	}
}

console.log(
	"\n== gap windows (seconds with any forward or failure, per owner class) ==",
);
for (const owner of ["a", "b"] as const) {
	const gapSeconds = seconds.filter((s) => notAnswered(s[owner]) > 0);
	const forwarded = seconds.reduce((sum, s) => sum + s[owner].forwarded, 0);
	const failed = seconds.reduce(
		(sum, s) =>
			sum + Object.values(s[owner].failedStatus).reduce((x, n) => x + n, 0),
		0,
	);
	const reasons: Record<string, number> = {};
	const failures: Record<string, number> = {};
	for (const s of seconds) {
		for (const [k, n] of Object.entries(s[owner].forwardReasons))
			reasons[k] = (reasons[k] ?? 0) + n;
		for (const [k, n] of Object.entries(s[owner].failedStatus))
			failures[k] = (failures[k] ?? 0) + n;
	}
	console.log(
		`${owner.toUpperCase()}-owned: ${gapSeconds.length} s with gaps${gapSeconds.length ? ` (${gapSeconds[0]?.second}..${gapSeconds.at(-1)?.second})` : ""}; forwarded ${forwarded} [${record(reasons)}]; failed ${failed} [${record(failures)}]`,
	);
}
type WindowBar = {
	replica: string;
	fromSecond: number;
	toSecond: number;
	requests: number;
	ownerUnavailable: number;
	forwarded: number;
	failed: number;
	handoffLate: number;
	handoffLatePercent: number;
};
type TwoOwnerWindow = {
	replica: string;
	switches: number;
	legal: number;
	events: number;
	customers: number;
};
if (summary.twoOwner) {
	const bars = (summary.windows ?? []) as WindowBar[];
	const detector = summary.twoOwner.perWindow as TwoOwnerWindow[];
	console.log(
		`\n== swap windows (SIGTERM -> /health 200 + 15 s), chaos ${summary.chaos ?? "none"} ==`,
	);
	console.log(
		"  swap | seconds        | requests | owner_unavailable | fwd  | failed | handoffLate (%)   | twoOwner events / customers | switches (legal)",
	);
	for (const [index, bar] of bars.entries()) {
		const two = detector[index];
		console.log(
			`  ${bar.replica.padEnd(4)} | ${`${bar.fromSecond}..${bar.toSecond}`.padEnd(14)} | ${String(bar.requests).padStart(8)} | ${String(bar.ownerUnavailable).padStart(17)} | ${String(bar.forwarded).padStart(4)} | ${String(bar.failed).padStart(6)} | ${`${bar.handoffLate} (${bar.handoffLatePercent}%)`.padEnd(17)} | ${`${two?.events ?? "-"} / ${two?.customers ?? "-"}`.padEnd(27)} | ${two?.switches ?? "-"} (${two?.legal ?? "-"})`,
		);
	}
	const { events, customers, outside, decisions, handIns, unknownWriters } =
		summary.twoOwner;
	console.log(
		`twoOwner: events ${events}, customers ${customers} (outside every window: ${outside.events} events, ${outside.customers} customers); ${decisions} decisions from ${handIns} hand-ins; unknown writers ${unknownWriters.length}`,
	);
	if (summary.twoOwner.samples?.length)
		console.log(
			`twoOwner samples: ${JSON.stringify(summary.twoOwner.samples.slice(0, 10))}`,
		);
	console.log(`swaps: ${JSON.stringify(summary.swapDurations)}`);
	console.log(
		`clock skew vs driver (ms): ${JSON.stringify(summary.clockSkewMs)}`,
	);
}
const atomOnlyDoubles =
	(summary.p1.doubled ?? 0) - (summary.p1.doubledAfterForward ?? 0);
console.log(
	`\nP1: ${JSON.stringify(summary.p1)} atomOnlyDoubles ${atomOnlyDoubles}`,
);
if (summary.locks?.taken)
	console.log(
		`locks: ${JSON.stringify(summary.locks)} stub finalizes ${summary.stub.finalizes} finalizeDupes ${summary.stub.finalizeDupes}`,
	);
if (summary.hot) console.log(`hot: ${JSON.stringify(summary.hot)}`);
for (const line of summary.handoffAnnouncements ?? [])
	console.log(`handoff announcements: ${JSON.stringify(line)}`);
for (const line of summary.swapDetails ?? [])
	console.log(`swap detail: ${JSON.stringify(line)}`);
for (const line of summary.longLocks ?? [])
	console.log(`long lock: ${JSON.stringify(line)}`);
console.log(`stub: ${JSON.stringify(summary.stub)}`);
console.log(`replicas: ${JSON.stringify(summary.replicas)}`);
