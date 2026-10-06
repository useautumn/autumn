import { splitRepetitionId } from "../repeat/repetitions.ts";

/** Below this many finished files the speed factor is noise; the UI shows "estimating…". */
const MIN_FINISHED_FOR_ETA = 5;
const EWMA_ALPHA = 0.2;
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 3;
/** Never claim a running file is about to finish sooner than this. */
const RUNNING_FLOOR_MS = 10_000;
const DEFAULT_BOOT_MS = 60_000;
const DEFAULT_TEARDOWN_MS = 30_000;

export type FileBaselineStats = {
	p50Ms: number;
	p90Ms: number;
	passRate: number;
};

type Expectation = { p50Ms: number; p90Ms: number; failRate: number };

/** Per-file expectations: own baseline, else the folder's median, else the global median. */
export type DurationModel = {
	expect: (file: string) => Expectation | null;
};

export type EtaPriors = {
	model: DurationModel;
	/** Recent worker boot p50 (account → serving); null falls back to a default. */
	bootP50Ms: number | null;
	teardownP50Ms: number | null;
};

export type EtaFile = {
	file: string;
	status: string;
	durationMs: number | null;
	finishedAt: number | null;
	/** When the current attempt started on its worker; null while queued. */
	startedAt: number | null;
	worker: string | null;
	attempt: number;
};

export type EtaWorker = { name: string; status: string };

export type RunEta = { etaMs: number; etaP90Ms: number };

const median = (values: number[]) => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const folderOf = (file: string) => file.slice(0, file.lastIndexOf("/"));

const medianExpectation = (stats: FileBaselineStats[]): Expectation | null => {
	const p50Ms = median(stats.map((s) => s.p50Ms));
	const p90Ms = median(stats.map((s) => s.p90Ms));
	const passRate = median(stats.map((s) => s.passRate));
	if (p50Ms === null || p90Ms === null || passRate === null) return null;
	return { p50Ms, p90Ms, failRate: 1 - passRate };
};

export const createDurationModel = ({
	baselines,
}: {
	baselines: Map<string, FileBaselineStats>;
}): DurationModel => {
	const byFolder = new Map<string, FileBaselineStats[]>();
	for (const [file, stats] of baselines) {
		const folder = folderOf(file);
		byFolder.set(folder, [...(byFolder.get(folder) ?? []), stats]);
	}
	const folderMedians = new Map(
		[...byFolder].map(([folder, stats]) => [folder, medianExpectation(stats)]),
	);
	const global = medianExpectation([...baselines.values()]);
	return {
		expect: (id) => {
			const { file } = splitRepetitionId({ id });
			const own = baselines.get(file);
			if (own)
				return {
					p50Ms: own.p50Ms,
					p90Ms: own.p90Ms,
					failRate: 1 - own.passRate,
				};
			return folderMedians.get(folderOf(file)) ?? global;
		},
	};
};

const isFinished = (status: string) =>
	status !== "queued" && status !== "running";

/** observed/expected over this run's passed files in finish order; 1 when nothing comparable finished. */
const speedFactor = ({
	finished,
	expect,
}: {
	finished: EtaFile[];
	expect: (file: string) => Expectation | null;
}) => {
	let factor = 1;
	const passed = finished
		.filter((f) => f.status === "passed" && f.durationMs !== null)
		.sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
	for (const f of passed) {
		const expected = expect(f.file);
		if (!expected || expected.p50Ms <= 0) continue;
		factor =
			EWMA_ALPHA * ((f.durationMs ?? 0) / expected.p50Ms) +
			(1 - EWMA_ALPHA) * factor;
	}
	return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
};

/** Min-heap of worker free times; pop the earliest, push it back busy until later. */
const createFreeTimeHeap = (times: number[]) => {
	const heap: number[] = [];
	const push = (value: number) => {
		heap.push(value);
		let i = heap.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (heap[parent] <= heap[i]) break;
			[heap[parent], heap[i]] = [heap[i], heap[parent]];
			i = parent;
		}
	};
	const pop = () => {
		const top = heap[0];
		const last = heap.pop() as number;
		if (heap.length > 0) {
			heap[0] = last;
			let i = 0;
			for (;;) {
				const left = 2 * i + 1;
				const right = left + 1;
				let smallest = i;
				if (left < heap.length && heap[left] < heap[smallest]) smallest = left;
				if (right < heap.length && heap[right] < heap[smallest])
					smallest = right;
				if (smallest === i) break;
				[heap[smallest], heap[i]] = [heap[i], heap[smallest]];
				i = smallest;
			}
		}
		return top;
	};
	for (const time of times) push(time);
	return { push, pop, values: () => heap };
};

/** Longest-processing-time-first list scheduling; returns when the last job ends. */
export const simulateLptMakespan = ({
	workerFreeAt,
	jobs,
	now,
}: {
	workerFreeAt: number[];
	jobs: number[];
	now: number;
}) => {
	if (workerFreeAt.length === 0) return null;
	const heap = createFreeTimeHeap(workerFreeAt);
	for (const job of [...jobs].sort((a, b) => b - a)) {
		const free = heap.pop();
		heap.push(Math.max(free, now) + job);
	}
	return Math.max(now, ...heap.values()) - now;
};

const LIVE_WORKER = new Set(["ready", "busy"]);
const ARRIVING_WORKER = new Set(["provisioning", "booting"]);

/**
 * Remaining wall time of a live run: per-file baselines scaled by this run's observed speed,
 * LPT-scheduled onto live and arriving workers, plus expected retries and teardown.
 */
export const estimateRunEta = ({
	now,
	files,
	workers,
	moreWorkersWanted,
	priors,
}: {
	now: number;
	files: EtaFile[];
	workers: EtaWorker[];
	/** Accounts the run still asks for beyond its live and booting workers. */
	moreWorkersWanted: number;
	priors: EtaPriors;
}): RunEta | null => {
	const finished = files.filter((f) => isFinished(f.status));
	if (finished.length < MIN_FINISHED_FOR_ETA) return null;
	const teardownMs = priors.teardownP50Ms ?? DEFAULT_TEARDOWN_MS;
	const unfinished = files.filter((f) => !isFinished(f.status));
	if (unfinished.length === 0) {
		const lastFinish = Math.max(...finished.map((f) => f.finishedAt ?? now));
		const left = Math.max(0, teardownMs - (now - lastFinish));
		return { etaMs: left, etaP90Ms: left };
	}

	// With no baselines at all, this run's own finished durations are the only evidence.
	const observed = finished.flatMap((f) => f.durationMs ?? []);
	const observedFallback =
		observed.length > 0
			? {
					p50Ms: median(observed) ?? 0,
					p90Ms: [...observed].sort((a, b) => a - b)[
						Math.floor(0.9 * (observed.length - 1))
					],
					failRate: 0,
				}
			: null;
	const expect = (file: string) =>
		priors.model.expect(file) ?? observedFallback;
	const factor = speedFactor({ finished, expect: priors.model.expect });

	const live = workers.filter((w) => LIVE_WORKER.has(w.status));
	const liveNames = new Set(live.map((w) => w.name));
	const bootMs = priors.bootP50Ms ?? DEFAULT_BOOT_MS;
	const arriving = workers.filter((w) => ARRIVING_WORKER.has(w.status)).length;
	const stillWanted = Math.min(
		moreWorkersWanted,
		Math.max(0, unfinished.length - live.length - arriving),
	);

	const schedule = (quantile: "p50Ms" | "p90Ms") => {
		const busyUntil = new Map<string, number>();
		const queued: number[] = [];
		for (const f of unfinished) {
			const e = expect(f.file);
			if (!e) return null;
			const duration = e[quantile] * factor;
			// A first attempt may still fail and rerun the whole file.
			const retry = f.attempt <= 1 ? e.failRate * duration : 0;
			const onWorker =
				f.status === "running" &&
				f.startedAt !== null &&
				f.worker !== null &&
				liveNames.has(f.worker);
			if (!onWorker) {
				queued.push(duration + retry);
				continue;
			}
			const elapsed = now - (f.startedAt ?? now);
			const tail =
				quantile === "p50Ms" && elapsed >= duration
					? e.p90Ms * factor
					: duration;
			const remaining = Math.max(tail - elapsed, RUNNING_FLOOR_MS);
			busyUntil.set(f.worker as string, now + remaining + retry);
		}
		const workerFreeAt = [
			...live.map((w) => busyUntil.get(w.name) ?? now),
			...Array.from({ length: arriving }, () => now + bootMs / 2),
			...Array.from({ length: stillWanted }, () => now + bootMs),
		];
		const makespan = simulateLptMakespan({ workerFreeAt, jobs: queued, now });
		return makespan === null ? null : makespan + teardownMs;
	};

	const etaMs = schedule("p50Ms");
	const etaP90Ms = schedule("p90Ms");
	if (etaMs === null || etaP90Ms === null) return null;
	return {
		etaMs: Math.round(etaMs),
		etaP90Ms: Math.round(Math.max(etaMs, etaP90Ms)),
	};
};
