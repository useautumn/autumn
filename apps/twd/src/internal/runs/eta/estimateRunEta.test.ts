import { describe, expect, test } from "bun:test";
import {
	createDurationModel,
	type EtaFile,
	type EtaPriors,
	estimateRunEta,
	type FileBaselineStats,
	simulateLptMakespan,
} from "./estimateRunEta.ts";

const NOW = 1_000_000;
const SEC = 1_000;

const stats = (p50s: number, p90s = p50s * 1.5, passRate = 1) => ({
	p50Ms: p50s * SEC,
	p90Ms: p90s * SEC,
	passRate,
});

const priorsFor = (
	baselines: Record<string, FileBaselineStats>,
	overrides: Partial<EtaPriors> = {},
): EtaPriors => ({
	model: createDurationModel({ baselines: new Map(Object.entries(baselines)) }),
	bootP50Ms: 30 * SEC,
	teardownP50Ms: 0,
	...overrides,
});

const done = (file: string, durationS: number, finishedAt = NOW): EtaFile => ({
	file,
	status: "passed",
	durationMs: durationS * SEC,
	finishedAt,
	startedAt: null,
	worker: null,
	attempt: 1,
});
const queued = (file: string): EtaFile => ({
	file,
	status: "queued",
	durationMs: null,
	finishedAt: null,
	startedAt: null,
	worker: null,
	attempt: 0,
});
const running = (file: string, worker: string, elapsedS: number): EtaFile => ({
	file,
	status: "running",
	durationMs: null,
	finishedAt: null,
	startedAt: NOW - elapsedS * SEC,
	worker,
	attempt: 1,
});
const busy = (name: string) => ({ name, status: "busy" });
const ready = (name: string) => ({ name, status: "ready" });

/** Five finished files that ran exactly at baseline: speed factor 1. */
const ON_PACE = ["a/1", "a/2", "a/3", "a/4", "a/5"];
const onPaceBaselines = Object.fromEntries(ON_PACE.map((f) => [f, stats(10)]));
const onPaceDone = ON_PACE.map((f) => done(f, 10));

describe("simulateLptMakespan", () => {
	test("schedules longest first onto the earliest free worker", () => {
		// LPT on 2 workers: 7 | 5+2 → 7; naive in-order 2+7 | 5 → 9.
		expect(
			simulateLptMakespan({ workerFreeAt: [0, 0], jobs: [2, 5, 7], now: 0 }),
		).toBe(7);
	});

	test("no workers means no estimate", () => {
		expect(simulateLptMakespan({ workerFreeAt: [], jobs: [1], now: 0 })).toBe(
			null,
		);
	});
});

describe("estimateRunEta", () => {
	test("hidden until enough files have finished", () => {
		expect(
			estimateRunEta({
				now: NOW,
				files: [...onPaceDone.slice(0, 4), queued("b/1")],
				workers: [ready("w1")],
				moreWorkersWanted: 0,
				priors: priorsFor({ ...onPaceBaselines, "b/1": stats(60) }),
			}),
		).toBe(null);
	});

	test("queued files use their own baseline, LPT-packed onto live workers", () => {
		const eta = estimateRunEta({
			now: NOW,
			files: [...onPaceDone, queued("b/1"), queued("b/2"), queued("b/3")],
			workers: [ready("w1"), ready("w2")],
			moreWorkersWanted: 0,
			priors: priorsFor(
				{
					...onPaceBaselines,
					"b/1": stats(60, 90),
					"b/2": stats(40, 50),
					"b/3": stats(20, 30),
				},
				{ teardownP50Ms: 5 * SEC },
			),
		});
		// p50: 60 | 40+20 → 60s; p90: 90 | 50+30 → 90s; plus 5s teardown.
		expect(eta).toEqual({ etaMs: 65 * SEC, etaP90Ms: 95 * SEC });
	});

	test("falls back to the folder median, then the global median", () => {
		const priors = priorsFor({
			...onPaceBaselines,
			"b/x": stats(100),
			"b/y": stats(200),
			"b/z": stats(300),
		});
		expect(priors.model.expect("b/new")?.p50Ms).toBe(200 * SEC);
		// Global median over 5×10s, 100, 200, 300 is 10s.
		expect(priors.model.expect("c/new")?.p50Ms).toBe(10 * SEC);
		// A repetition id resolves to its file's baseline.
		expect(priors.model.expect("b/x#3")?.p50Ms).toBe(100 * SEC);

		const eta = estimateRunEta({
			now: NOW,
			files: [...onPaceDone, queued("b/new")],
			workers: [ready("w1")],
			moreWorkersWanted: 0,
			priors,
		});
		expect(eta?.etaMs).toBe(200 * SEC);
	});

	test("with no baselines at all, uses this run's own finished durations", () => {
		const eta = estimateRunEta({
			now: NOW,
			files: [
				done("a/1", 10),
				done("a/2", 20),
				done("a/3", 30),
				done("a/4", 40),
				done("a/5", 50),
				queued("b/1"),
			],
			workers: [ready("w1")],
			moreWorkersWanted: 0,
			priors: priorsFor({}),
		});
		expect(eta?.etaMs).toBe(30 * SEC);
		expect(eta?.etaP90Ms).toBe(40 * SEC);
	});

	test("a run going 3× slower than baseline stretches the remaining work", () => {
		const eta = estimateRunEta({
			now: NOW,
			files: [
				...ON_PACE.map((f, i) => done(f, 30, NOW - (5 - i) * SEC)),
				queued("b/1"),
			],
			workers: [ready("w1")],
			moreWorkersWanted: 0,
			priors: priorsFor({ ...onPaceBaselines, "b/1": stats(60, 60) }),
		});
		// Ratios of 3 pull the EWMA (prior 1, α 0.2) to 1 + 2·(1−0.8⁵) ≈ 2.34.
		expect(eta?.etaMs).toBeGreaterThan(60 * SEC * 2.3);
		expect(eta?.etaMs).toBeLessThan(60 * SEC * 2.4);
	});

	test("the speed factor is clamped to 0.5–3", () => {
		const eta = estimateRunEta({
			now: NOW,
			files: [...ON_PACE.map((f) => done(f, 1_000)), queued("b/1")],
			workers: [ready("w1")],
			moreWorkersWanted: 0,
			priors: priorsFor({ ...onPaceBaselines, "b/1": stats(60, 60) }),
		});
		expect(eta?.etaMs).toBe(180 * SEC);
	});

	test("a running file counts only its remaining time", () => {
		const eta = estimateRunEta({
			now: NOW,
			files: [...onPaceDone, running("b/1", "w1", 45)],
			workers: [busy("w1")],
			moreWorkersWanted: 0,
			priors: priorsFor({ ...onPaceBaselines, "b/1": stats(60, 120) }),
		});
		expect(eta).toEqual({ etaMs: 15 * SEC, etaP90Ms: 75 * SEC });
	});

	test("a file already past its p50 uses the p90 tail, then the floor", () => {
		const priors = priorsFor({ ...onPaceBaselines, "b/1": stats(60, 120) });
		const past = estimateRunEta({
			now: NOW,
			files: [...onPaceDone, running("b/1", "w1", 90)],
			workers: [busy("w1")],
			moreWorkersWanted: 0,
			priors,
		});
		expect(past).toEqual({ etaMs: 30 * SEC, etaP90Ms: 30 * SEC });

		const wayPast = estimateRunEta({
			now: NOW,
			files: [...onPaceDone, running("b/1", "w1", 600)],
			workers: [busy("w1")],
			moreWorkersWanted: 0,
			priors,
		});
		expect(wayPast).toEqual({ etaMs: 10 * SEC, etaP90Ms: 10 * SEC });
	});

	test("workers still wanted arrive after the boot p50 and take queued work", () => {
		const files = [...onPaceDone, queued("b/1"), queued("b/2")];
		const priors = priorsFor({
			...onPaceBaselines,
			"b/1": stats(100, 100),
			"b/2": stats(100, 100),
		});
		const oneWorker = estimateRunEta({
			now: NOW,
			files,
			workers: [ready("w1")],
			moreWorkersWanted: 0,
			priors,
		});
		expect(oneWorker?.etaMs).toBe(200 * SEC);
		const withArrival = estimateRunEta({
			now: NOW,
			files,
			workers: [ready("w1")],
			moreWorkersWanted: 3,
			priors,
		});
		// The second worker boots for 30s, then runs b/2 alongside w1.
		expect(withArrival?.etaMs).toBe(130 * SEC);
	});

	test("expected retries add failure rate × duration for first attempts", () => {
		const eta = estimateRunEta({
			now: NOW,
			files: [...onPaceDone, queued("b/1")],
			workers: [ready("w1")],
			moreWorkersWanted: 0,
			priors: priorsFor({ ...onPaceBaselines, "b/1": stats(100, 100, 0.8) }),
		});
		expect(eta?.etaMs).toBe(120 * SEC);
	});

	test("once every file is done only the teardown remains", () => {
		const eta = estimateRunEta({
			now: NOW,
			files: ON_PACE.map((f) => done(f, 10, NOW - 10 * SEC)),
			workers: [],
			moreWorkersWanted: 0,
			priors: priorsFor(onPaceBaselines, { teardownP50Ms: 30 * SEC }),
		});
		expect(eta).toEqual({ etaMs: 20 * SEC, etaP90Ms: 20 * SEC });
	});

	test("unfinished work with no workers and none coming has no estimate", () => {
		expect(
			estimateRunEta({
				now: NOW,
				files: [...onPaceDone, queued("b/1")],
				workers: [],
				moreWorkersWanted: 0,
				priors: priorsFor({ ...onPaceBaselines, "b/1": stats(10) }),
			}),
		).toBe(null);
	});
});
