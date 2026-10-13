/** Phase and remaining time from prepare.sh's `[qa-prepare]` lines, using measured step durations. */
const STEPS: [marker: string, phase: string, doneMs: number][] = [
	["ready for snapshot", "snapshotting", 115_000],
	["dashboard built", "finishing migrations", 100_000],
	["installed", "building dashboard", 15_000],
	["fetched", "installing dependencies", 5_000],
	["extracting", "unpacking source", 1_000],
];
const TOTAL_MS = 135_000;

export function buildProgress({
	log,
	elapsedMs,
}: {
	log: string;
	elapsedMs: number;
}) {
	const step = STEPS.find(([marker]) => log.includes(marker));
	const doneMs = Math.max(elapsedMs, step?.[2] ?? 0);
	return {
		phase: step?.[1] ?? "starting container",
		elapsedMs,
		remainingMs: Math.max(0, TOTAL_MS - doneMs),
		percent: Math.min(99, (doneMs / TOTAL_MS) * 100),
	};
}
