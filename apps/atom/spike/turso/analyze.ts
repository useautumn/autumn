import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Joins writer acks with reader first-seen times: write latency, sync lag, and replica correctness. */
const runDir = process.argv[2]!;
const load = (f: string) => JSON.parse(readFileSync(join(runDir, f), "utf8"));
const writer = load("writer.json");
const { scenario, faultLog } = load("scenario.json");

const pct = (xs: number[], p: number) => {
	if (xs.length === 0) return null;
	const s = [...xs].sort((a, b) => a - b);
	return (
		Math.round(
			s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! * 10,
		) / 10
	);
};
const dist = (xs: number[]) => ({
	n: xs.length,
	p50: pct(xs, 50),
	p90: pct(xs, 90),
	p99: pct(xs, 99),
	max: pct(xs, 100),
});

const ackBySeq = new Map<number, number>();
const finalSeqByKey = new Map<string, number>();
for (const [seq, key, , ackMs] of writer.acks as number[][]) {
	ackBySeq.set(seq!, ackMs!);
	const id = `cus_spike_${key!.toString().padStart(6, "0")}`;
	if ((finalSeqByKey.get(id) ?? 0) < seq!) finalSeqByKey.set(id, seq!);
}
const writeMs = (writer.acks as number[][]).map(
	([, , sent, ack]) => ack! - sent!,
);

const readerFiles = readdirSync(runDir).filter((f) => f.startsWith("reader-"));
type ReaderPart = Record<string, any>;
const readers = new Map<
	number,
	{ seenBySeq: Map<number, number>; parts: ReaderPart[] }
>();
for (const f of readerFiles) {
	const i = Number(f.split("-")[1]);
	const r = load(f);
	const entry = readers.get(i) ?? {
		seenBySeq: new Map<number, number>(),
		parts: [] as ReaderPart[],
	};
	for (const [seq, at] of r.seen as number[][]) {
		const prev = entry.seenBySeq.get(seq!);
		if (prev === undefined || at! < prev) entry.seenBySeq.set(seq!, at!);
	}
	entry.parts.push(r);
	readers.set(i, entry);
}

const perReader = [...readers.entries()]
	.sort(([a], [b]) => a - b)
	.map(([i, { seenBySeq, parts }]) => {
		const lag = [...seenBySeq.entries()]
			.filter(([s]) => ackBySeq.has(s))
			.map(([s, at]) => at - ackBySeq.get(s)!);
		const last = parts.find((p) => p.done) ?? parts.at(-1);
		const final = new Map<string, number>(
			(last?.finalState ?? []) as [string, number][],
		);
		let missingKeys = 0;
		let staleKeys = 0;
		for (const [key, seq] of finalSeqByKey) {
			const got = final.get(key);
			if (got === undefined) missingKeys += 1;
			else if (got < seq) staleKeys += 1;
		}
		return {
			reader: i,
			incarnations: parts.length,
			lagMs: dist(lag),
			seenPct: Math.round((1000 * lag.length) / ackBySeq.size) / 10,
			syncCallMs: dist(parts.flatMap((p) => p.syncMs)),
			syncCalls: parts.reduce((n, p) => n + p.syncMs.length, 0),
			bootstrapMs: parts.map((p) =>
				p.firstSyncDoneMs ? Math.round(p.firstSyncDoneMs - p.openedAtMs) : null,
			),
			outOfOrder: parts.reduce((n, p) => n + p.outOfOrder, 0),
			errors: parts.reduce((n, p) => n + p.errors.length, 0),
			errorSample: parts.flatMap((p) => p.errors).slice(0, 3),
			finalKeys: final.size,
			missingKeys,
			staleKeys,
			readUs: last?.readUs ? dist(last.readUs) : null,
			receivedBytes: last?.receivedBytes ?? null,
		};
	});

const allSeen = [...ackBySeq.entries()].flatMap(([seq, ack]) => {
	const times = [...readers.values()].map((r) => r.seenBySeq.get(seq));
	if (times.some((t) => t === undefined)) return [];
	return [Math.max(...(times as number[])) - ack];
});

const summary = {
	name: scenario.name,
	engine: scenario.engine,
	readers: scenario.readers,
	writes: {
		acked: writer.acks.length,
		errors: writer.errors.length,
		errorSample: writer.errors.slice(0, 3),
		latencyMs: dist(writeMs),
		achievedPerSec: Math.round(
			writer.acks.length / ((writer.endMs - writer.startMs) / 1000),
		),
	},
	visibleOnAllReplicasLagMs: dist(allSeen),
	expectedKeys: finalSeqByKey.size,
	perReader,
	faultLog,
};
writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
