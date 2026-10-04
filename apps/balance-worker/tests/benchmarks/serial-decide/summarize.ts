// Summarises matrix jsonl: per configuration (label without -rN), the median of reps.
// Usage: bun summarize.ts results.jsonl
const file = process.argv[2];
if (!file) throw new Error("usage: summarize.ts results.jsonl");
type Row = {
	label: string;
	tracksPerSec: number;
	errors: number;
	p50Ms: number;
	p99Ms: number;
	processUsPerTrack: number;
	processUtil: number;
	roles: Record<string, number>;
	final: Record<string, Record<string, number>>;
};
const rows: Row[] = (await Bun.file(file).text())
	.split("\n")
	.filter((line) => line.startsWith("{"))
	.map((line) => JSON.parse(line));
const groups = new Map<string, Row[]>();
for (const row of rows) {
	const key = row.label.replace(/-r\d+$/, "");
	groups.set(key, [...(groups.get(key) ?? []), row]);
}
const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	return s.length === 0 ? Number.NaN : s.length % 2 ? (s[(s.length - 1) / 2] as number) : ((s[s.length / 2 - 1] as number) + (s[s.length / 2] as number)) / 2;
};
const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "-");
console.log("| config | tracks/s | p50 ms | p99 ms | process µs/track (util %) | sequencer µs/track | kafka | io (sum) | GC helper | errors | reps |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [key, group] of groups) {
	const pick = (f: (r: Row) => number) => median(group.map(f));
	const io = (r: Row) => Object.entries(r.roles).filter(([k]) => k.startsWith("io")).reduce((a, [, v]) => a + v, 0);
	console.log(
		`| ${key} | ${fmt(pick((r) => r.tracksPerSec))} | ${fmt(pick((r) => r.p50Ms), 1)} | ${fmt(pick((r) => r.p99Ms), 1)} | ${fmt(pick((r) => r.processUsPerTrack))} (${fmt(pick((r) => r.processUtil))}) | ${fmt(pick((r) => r.roles.sequencer ?? r.roles.main ?? Number.NaN))} | ${fmt(pick((r) => r.roles.kafka ?? Number.NaN))} | ${fmt(pick(io))} | ${fmt(pick((r) => r.roles.HeapHelper ?? Number.NaN))} | ${fmt(pick((r) => r.errors))} | ${group.length} (${group.map((r) => r.tracksPerSec).join(", ")}) |`,
	);
}
