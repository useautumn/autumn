// Summarises matrix jsonl: per configuration, the median of reps for throughput and CPU per track.
const file = process.argv[2];
if (!file) throw new Error("usage: summarize.ts results.jsonl");
const rows = (await Bun.file(file).text())
	.split("\n")
	.filter((l) => l.startsWith("{"))
	.map((l) => JSON.parse(l));
const groups = new Map<string, any[]>();
for (const row of rows) {
	const key = String(row.label).replace(/-r\d+$/, "");
	groups.set(key, [...(groups.get(key) ?? []), row]);
}
const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "-");
console.log("| config | tracks/s | p50 ms | Bun µs/track (main) | Bun util % | front µs/track | front util % | reps |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [key, group] of groups) {
	const pick = (f: (r: any) => number) => median(group.map(f));
	const bun = (r: any) => r.procs.bun ?? {};
	const front = (r: any) => r.procs.front ?? {};
	console.log(
		`| ${key} | ${fmt(pick((r) => r.tracksPerSec))} | ${pick((r) => r.p50Ms).toFixed(1)} | ${fmt(pick((r) => bun(r).cpuUsPerTrack))} (${fmt(pick((r) => bun(r).mainThreadUsPerTrack))}) | ${fmt(pick((r) => bun(r).cpuUtil))} | ${group[0].procs.front ? fmt(pick((r) => front(r).cpuUsPerTrack)) : "-"} | ${group[0].procs.front ? fmt(pick((r) => front(r).cpuUtil)) : "-"} | ${group.length} (${group.map((r) => r.tracksPerSec).join(", ")}) |`,
	);
}
