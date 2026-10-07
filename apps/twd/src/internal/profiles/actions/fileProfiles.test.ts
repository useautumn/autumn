import { describe, expect, test } from "bun:test";
import type { FileStats } from "@tw/worker/runTestFileWithStats.ts";
import type { FileProfile } from "../types/fileProfile.ts";
import type { FileProfileSample } from "../types/fileProfileSample.ts";
import type { ProfileMetrics } from "../types/profileMetrics.ts";
import { buildRunSamples } from "./collectRunSamples.ts";
import { estimateFileProfiles } from "./estimateFileProfiles.ts";
import {
	combineRunSamples,
	foldFileProfile,
	statsToProfileMetrics,
} from "./foldFileProfile.ts";

const stats = (overrides: {
	wallMs?: number;
	exitCode?: number;
	requests?: number;
	peakRps?: number;
	memPeakMib?: number;
}): FileStats => ({
	v: 1,
	wallMs: overrides.wallMs ?? 10_000,
	exitCode: overrides.exitCode ?? 0,
	concurrentMax: 1,
	stripe: {
		requests: overrides.requests ?? 40,
		testRequests: 30,
		serverRequests: 10,
		apportionedRequests: 0,
		peakRps: overrides.peakRps ?? 4,
		meanRps: 4,
		peakInFlight: 2,
		meanInFlight: 0.5,
		rateLimited: 0,
		rateLimitedReasons: {},
		permitWaitMs: 100,
		permitWaitMaxMs: 50,
		permitWaitP95Ms: 10,
		machinePeakRps: 5,
		machinePeakInFlight: 3,
		machineRateLimited: 0,
	},
	cpu: { coreSeconds: 8, peakCores: 1.6, testProcessSeconds: 3 },
	mem: { peakMib: overrides.memPeakMib ?? 2_000, testProcessPeakMib: 300 },
});

const sample = (
	overrides: Partial<FileProfileSample> & { stats?: FileStats } = {},
): FileProfileSample => ({
	durationMs: overrides.durationMs ?? 10_000,
	failure: overrides.failure ?? 0,
	hung: overrides.hung ?? false,
	packed: overrides.packed ?? false,
	metrics:
		overrides.metrics === undefined
			? statsToProfileMetrics(overrides.stats ?? stats({}))
			: overrides.metrics,
});

const fold = (previous: FileProfile | undefined, next: FileProfileSample) =>
	foldFileProfile({
		previous,
		sample: next,
		file: "a/b/x.test.ts",
		workerClass: "2c4g-us-east-1",
		runId: "run_1",
	});

describe("foldFileProfile", () => {
	test("the first sample becomes the profile", () => {
		const profile = fold(undefined, sample({}));
		expect(profile).toMatchObject({
			samples: 1,
			statsSamples: 1,
			durationMeanMs: 10_000,
			durationVariance: 0,
			stripeRequests: 40,
			stripePeakRps: 4,
			memPeakMib: 2_000,
		});
	});

	test("means move by 0.3 of the gap; peaks rise by 0.5 and fall by 0.15", () => {
		const first = fold(undefined, sample({}));
		const higher = fold(
			first,
			sample({
				stats: stats({ requests: 140, peakRps: 14, memPeakMib: 3_000 }),
			}),
		);
		expect(higher.stripeRequests).toBeCloseTo(70);
		expect(higher.stripePeakRps).toBeCloseTo(9);
		expect(higher.memPeakMib).toBeCloseTo(2_500);
		const lower = fold(
			higher,
			sample({ stats: stats({ peakRps: 1, memPeakMib: 500 }) }),
		);
		expect(lower.stripePeakRps).toBeCloseTo(9 - 0.15 * 8);
		expect(lower.memPeakMib).toBeCloseTo(2_500 - 0.15 * 2_000);
	});

	test("duration keeps an EW variance; a hung sample only raises the mean", () => {
		const first = fold(undefined, sample({ durationMs: 10_000 }));
		const slower = fold(first, sample({ durationMs: 20_000 }));
		expect(slower.durationMeanMs).toBeCloseTo(13_000);
		expect(slower.durationVariance).toBeCloseTo(0.7 * 10_000 * 3_000);
		const hungFast = fold(slower, sample({ durationMs: 1_000, hung: true }));
		expect(hungFast.durationMeanMs).toBeCloseTo(13_000);
		const hungSlow = fold(slower, sample({ durationMs: 300_000, hung: true }));
		expect(hungSlow.durationMeanMs).toBeCloseTo(13_000 + 0.5 * 287_000);
	});

	test("fail rate uses alpha 0.1; a sample without stats keeps the old metrics", () => {
		const first = fold(undefined, sample({}));
		const failedNoStats = fold(first, sample({ failure: 1, metrics: null }));
		expect(failedNoStats.failRate).toBeCloseTo(0.1);
		expect(failedNoStats.stripeRequests).toBe(40);
		expect(failedNoStats.statsSamples).toBe(1);
		expect(failedNoStats.samples).toBe(2);
	});
});

test("packed failures feed their own fast-moving rate; solo runs leave it alone", () => {
	const first = fold(undefined, sample({}));
	expect(first.packedFailRate).toBeNull();
	const packedFail = fold(first, sample({ failure: 1, packed: true }));
	expect(packedFail).toMatchObject({ packedSamples: 1, packedFailRate: 1 });
	const packedPass = fold(packedFail, sample({ packed: true }));
	expect(packedPass.packedFailRate).toBeCloseTo(0.5);
	expect(fold(packedPass, sample({ failure: 1 })).packedFailRate).toBeCloseTo(
		0.5,
	);
});

test("a repeat run counts once: means averaged, peaks keep the worst", () => {
	const combined = combineRunSamples([
		sample({ durationMs: 10_000, stats: stats({ requests: 10, peakRps: 2 }) }),
		sample({
			durationMs: 20_000,
			failure: 1,
			stats: stats({ requests: 30, peakRps: 8 }),
		}),
	]);
	expect(combined.durationMs).toBe(15_000);
	expect(combined.failure).toBe(0.5);
	expect(combined.metrics?.stripeRequests).toBe(20);
	expect(combined.metrics?.stripePeakRps).toBe(8);
});

describe("buildRunSamples", () => {
	test("uses the first attempt's stats even when a retry is the final result", () => {
		const samples = buildRunSamples({
			results: [
				{
					file: "x.test.ts",
					repetition: null,
					status: "passed",
					attempt: 2,
					durationMs: 5_000,
				},
			],
			statsRows: [
				{
					file: "x.test.ts",
					repetition: null,
					stats: stats({ wallMs: 9_000, exitCode: 1 }),
				},
			],
		});
		expect(samples.get("x.test.ts")).toMatchObject({
			durationMs: 9_000,
			failure: 1,
			hung: false,
		});
	});

	test("without stats only a first-attempt final result counts; skipped files never do", () => {
		const samples = buildRunSamples({
			results: [
				{
					file: "first.test.ts",
					repetition: null,
					status: "timed_out",
					attempt: 1,
					durationMs: 300_000,
				},
				{
					file: "retried.test.ts",
					repetition: null,
					status: "passed",
					attempt: 2,
					durationMs: 5_000,
				},
				{
					file: "skipped.test.ts",
					repetition: null,
					status: "skipped",
					attempt: 1,
					durationMs: 0,
				},
			],
			statsRows: [],
		});
		expect([...samples.keys()]).toEqual(["first.test.ts"]);
		expect(samples.get("first.test.ts")).toMatchObject({
			hung: true,
			failure: 1,
			metrics: null,
		});
	});
});

describe("estimateFileProfiles", () => {
	const profile = (file: string, durationMeanMs: number): FileProfile => ({
		...fold(undefined, sample({ durationMs: durationMeanMs })),
		file,
		samples: 3,
	});
	const folder = Array.from({ length: 5 }, (_, i) =>
		profile(`integration/billing/f${i}.test.ts`, (i + 1) * 1_000),
	);
	const profiles = [...folder, profile("crud/a.test.ts", 50_000)];

	test("a profiled file uses its own profile", () => {
		const estimate = estimateFileProfiles({
			files: ["crud/a.test.ts#2"],
			profiles,
		}).get("crud/a.test.ts#2");
		expect(estimate).toMatchObject({
			source: "file",
			confidence: 1,
			durationMs: 50_000,
		});
	});

	test("a new file falls back to its nearest folder with 5 profiles, then the suite", () => {
		const estimates = estimateFileProfiles({
			files: ["integration/billing/deep/new.test.ts", "crud/new.test.ts"],
			profiles,
		});
		expect(estimates.get("integration/billing/deep/new.test.ts")).toMatchObject(
			{
				source: "folder",
				folder: "integration/billing",
				confidence: 0,
				durationMs: 3_000,
			},
		);
		expect(estimates.get("crud/new.test.ts")).toMatchObject({
			source: "global",
			durationMs: 5_000,
		});
		const metrics = estimates.get("crud/new.test.ts")
			?.metrics as ProfileMetrics;
		expect(metrics.stripeRequests).toBe(40);
	});

	test("with no profiles at all there is no estimate", () => {
		expect(
			estimateFileProfiles({ files: ["x.test.ts"], profiles: [] }).get(
				"x.test.ts",
			),
		).toBeNull();
	});
});
