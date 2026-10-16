/**
 * Reads a rig:roll run and prints, per owner class, each second's answered / forwarded (by reason) / failed counts around
 * every swap, with the swap's events as markers, then the gap windows: the first and last second a class saw anything but
 * an answer, and the P1 reconciliation. `bun run rig:rollreport <run dir>`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type OwnerClass, percentileOf, type RollCounts } from "./rigShared.js";

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
		const from = marks.find((m) => m.name === `${replica} deregistered`);
		const to = marks.find((m) => m.name === `${replica} registered`);
		if (from && to)
			swaps.push({
				replica,
				from: Math.floor(from.second) - 3,
				to: Math.ceil(to.second) + 5,
			});
	}
	return swaps;
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
console.log(`\nP1: ${JSON.stringify(summary.p1)}`);
console.log(`stub: ${JSON.stringify(summary.stub)}`);
console.log(`replicas: ${JSON.stringify(summary.replicas)}`);
