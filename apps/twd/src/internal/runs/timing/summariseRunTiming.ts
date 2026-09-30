import type { RunDetail } from "../../../api/contract.ts";

const at = (iso: string | null | undefined) =>
	iso ? Date.parse(iso) : undefined;

const BUCKETS = [
	{ label: "<15s", maxMs: 15_000 },
	{ label: "15–30s", maxMs: 30_000 },
	{ label: "30–60s", maxMs: 60_000 },
	{ label: "1–2m", maxMs: 120_000 },
	{ label: "2–3m", maxMs: 180_000 },
	{ label: "3–5m", maxMs: 300_000 },
	{ label: "5m+", maxMs: Number.POSITIVE_INFINITY },
];

export type RunTiming = {
	/** Offsets (ms) from run creation; null when that point hasn't happened. */
	marks: {
		warmReady: number | null;
		accounts: number | null;
		firstWorkerReady: number | null;
		lastWorkerReady: number | null;
		firstFileDone: number | null;
		halfFilesDone: number | null;
		ninetyFilesDone: number | null;
		lastFileDone: number | null;
		finished: number | null;
	};
	wallMs: number;
	/** Sequential phases that add up to the wall time. */
	phases: { phase: string; ms: number }[];
	/** Cumulative files done over time, one point per finished file. */
	completion: { atMs: number; done: number }[];
	histogram: { bucket: string; passed: number; failed: number }[];
	/** The long tail that sets wall time. */
	slowest: {
		file: string;
		durationMs: number;
		attempt: number;
		status: string;
	}[];
};

/** Where a run's wall time went, from its milestones, worker ready times and file finish times. */
export const summariseRunTiming = (
	run: Pick<
		RunDetail,
		"createdAt" | "finishedAt" | "milestones" | "workers" | "files"
	>,
	now = Date.now(),
): RunTiming => {
	const t0 = Date.parse(run.createdAt);
	const rel = (ms: number | undefined) => (ms === undefined ? null : ms - t0);
	const readyTimes = run.workers
		.flatMap((w) => at(w.readyAt) ?? [])
		.sort((a, b) => a - b);
	const doneTimes = run.files
		.flatMap((f) => at(f.finishedAt) ?? [])
		.sort((a, b) => a - b);
	const nth = (q: number) =>
		doneTimes.length >= Math.ceil(q * run.files.length)
			? doneTimes[Math.max(0, Math.ceil(q * run.files.length) - 1)]
			: undefined;
	const finished = at(run.finishedAt);
	const marks: RunTiming["marks"] = {
		warmReady: rel(at(run.milestones?.warmReadyAt)),
		accounts: rel(at(run.milestones?.accountsAt)),
		firstWorkerReady: rel(readyTimes[0]),
		lastWorkerReady: rel(readyTimes.at(-1)),
		firstFileDone: rel(doneTimes[0]),
		halfFilesDone: rel(nth(0.5)),
		ninetyFilesDone: rel(nth(0.9)),
		lastFileDone: rel(
			doneTimes.length === run.files.length ? doneTimes.at(-1) : undefined,
		),
		finished: rel(finished),
	};
	const wallMs = (finished ?? now) - t0;

	const cuts: [string, number | null][] = [
		["warm image", marks.warmReady],
		["waiting for accounts", marks.accounts],
		["first worker boot", marks.firstWorkerReady],
		["tests", marks.lastFileDone],
		["teardown", marks.finished],
	];
	const phases: RunTiming["phases"] = [];
	let prev = 0;
	for (const [phase, end] of cuts) {
		if (end === null) continue;
		phases.push({ phase, ms: Math.max(0, end - prev) });
		prev = Math.max(prev, end);
	}

	const timed = run.files.filter((f) => f.durationMs !== null);
	return {
		marks,
		wallMs,
		phases,
		completion: doneTimes.map((t, i) => ({ atMs: t - t0, done: i + 1 })),
		histogram: BUCKETS.map((b, i) => {
			const min = BUCKETS[i - 1]?.maxMs ?? 0;
			const inBucket = timed.filter(
				(f) => (f.durationMs ?? 0) >= min && (f.durationMs ?? 0) < b.maxMs,
			);
			const failed = inBucket.filter(
				(f) => f.status === "failed" || f.status === "crashed",
			).length;
			return {
				bucket: b.label,
				passed: inBucket.length - failed,
				failed,
			};
		}),
		slowest: [...timed]
			.sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
			.slice(0, 5)
			.map((f) => ({
				file: f.file,
				durationMs: f.durationMs ?? 0,
				attempt: f.attempt,
				status: f.status,
			})),
	};
};
