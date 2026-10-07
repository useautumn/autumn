import { describe, expect, test } from "bun:test";
import type { FileProfileEstimate } from "../../../profiles/types/fileProfileEstimate.ts";
import type { ProfileMetrics } from "../../../profiles/types/profileMetrics.ts";
import { soloReasons } from "../detectSoloFiles.ts";
import type { SizingShard } from "../types/sizingShard.ts";
import { chooseFilesPerWorker } from "./chooseFilesPerWorker.ts";
import { planRunSizing } from "./planRunSizing.ts";
import { sizeShardWorkers } from "./sizeShardWorkers.ts";

const LIMITS = { stripeRps: 5, stripeInFlight: 2, cores: 2, memoryMib: 4096 };

const metrics = (overrides: Partial<ProfileMetrics> = {}): ProfileMetrics => ({
	stripeRequests: 40,
	stripeTestRequests: 30,
	stripeServerRequests: 10,
	stripeMeanRps: 0.4,
	stripeMeanInFlight: 0.15,
	rateLimited: 0,
	permitWaitMs: 0,
	cpuCoreSeconds: 0.5 * 30,
	testCpuSeconds: 5,
	stripePeakRps: 3,
	stripePeakInFlight: 2,
	workerPeakRps: 3,
	workerPeakInFlight: 2,
	permitWaitP95Ms: 1,
	cpuPeakCores: 1.5,
	memPeakMib: 1_500,
	testPeakMib: 300,
	...overrides,
});

const estimate = (
	overrides: Partial<FileProfileEstimate> = {},
): FileProfileEstimate => ({
	source: "file",
	folder: null,
	confidence: 1,
	durationMs: 30_000,
	durationP90Ms: 30_000,
	failRate: 0,
	packedFailRate: null,
	metrics: metrics(),
	...overrides,
});

const ids = (prefix: string, n: number) =>
	Array.from({ length: n }, (_, i) => `${prefix}/f${i}.test.ts`);

const estimatesFor = (
	files: string[],
	make: (file: string, i: number) => FileProfileEstimate,
) => new Map(files.map((file, i) => [file, make(file, i)]));

describe("chooseFilesPerWorker", () => {
	test("light, uniform files pack up to the cap", () => {
		const files = ids("a", 20);
		const choice = chooseFilesPerWorker({
			files,
			estimates: estimatesFor(files, () => estimate()),
			soloCandidates: new Set(),
			limits: { headroom: 0.65, ...LIMITS },
		});
		expect(choice.filesPerWorker).toBe(4);
		expect(choice.binding).toBeNull();
		expect(choice.packable.size).toBe(20);
	});

	test("Stripe in-flight binds: 0.4 mean in-flight each fits 3 files under 65% of 2", () => {
		const files = ids("a", 20);
		const choice = chooseFilesPerWorker({
			files,
			estimates: estimatesFor(files, () =>
				estimate({ metrics: metrics({ stripeMeanInFlight: 0.4 }) }),
			),
			soloCandidates: new Set(),
			limits: { headroom: 0.65, ...LIMITS },
		});
		expect(choice.filesPerWorker).toBe(3);
		expect(choice.binding).toBe("stripeInFlight");
		expect(choice.load?.stripeInFlight).toBeCloseTo(1.2);
	});

	test("memory overhead counts once; heavy and org-mutating files never pack", () => {
		const files = ids("a", 10);
		const heavy = files[0] as string;
		const orgMutating = files[1] as string;
		const choice = chooseFilesPerWorker({
			files,
			estimates: estimatesFor(files, (file) =>
				file === heavy
					? estimate({
							metrics: metrics({ memPeakMib: 2_800, testPeakMib: 1_600 }),
						})
					: estimate({
							metrics: metrics({ memPeakMib: 1_800, testPeakMib: 600 }),
						}),
			),
			soloCandidates: new Set([orgMutating]),
			limits: { headroom: 0.65, ...LIMITS },
		});
		expect(choice.packable.has(heavy)).toBe(false);
		expect(choice.packable.has(orgMutating)).toBe(false);
		// overhead 1,200 MiB + k × 600 ≤ 0.65 × 4,096 → k = 2
		expect(choice.filesPerWorker).toBe(2);
		expect(choice.binding).toBe("memoryMib");
	});

	test("files without stats never pack, and fewer than two packable files means one per worker", () => {
		const files = ids("a", 3);
		const choice = chooseFilesPerWorker({
			files,
			estimates: estimatesFor(files, (_, i) =>
				i === 0 ? estimate() : estimate({ source: "folder" }),
			),
			soloCandidates: new Set(),
			limits: { headroom: 0.65, ...LIMITS },
		});
		expect(choice.filesPerWorker).toBe(1);
	});
});

describe("sizeShardWorkers", () => {
	test("fewest workers whose longest-first makespan fits the target, ×1.3 for safety", () => {
		// 1×100 s + 10×10 s: two slots finish in 100 s, one slot needs 200 s; ceil(2 × 1.3) = 3.
		const durations = [100_000, ...Array(10).fill(10_000)];
		expect(
			sizeShardWorkers({
				durations,
				failRates: durations.map(() => 0),
				filesPerWorker: 1,
				targetMs: 105_000,
			}),
		).toEqual({ workers: 3, makespanMs: 100_000 });
		expect(
			sizeShardWorkers({
				durations,
				failRates: durations.map(() => 0),
				filesPerWorker: 2,
				targetMs: 105_000,
			}).workers,
		).toBe(2);
	});

	test("expected retries add spare workers, never more than one per file or the cap", () => {
		const durations = [100_000, ...Array(10).fill(10_000)];
		const failRates = durations.map(() => 0.2);
		expect(
			sizeShardWorkers({
				durations,
				failRates,
				filesPerWorker: 1,
				targetMs: 105_000,
			}).workers,
		).toBe(3 + Math.ceil(1.5 * 0.2 * 11));
		expect(
			sizeShardWorkers({
				durations,
				failRates,
				filesPerWorker: 1,
				targetMs: 105_000,
				maxWorkers: 3,
			}).workers,
		).toBe(3);
	});
});

describe("planRunSizing", () => {
	const main = ids("main", 40);
	const svix = ids("svix", 4);
	const shards: SizingShard[] = [
		{ key: "main", files: main },
		{ key: "svix", files: svix, maxWorkers: 2 },
	];
	const base = {
		repeat: 1,
		shards,
		staticSolo: new Set<string>(),
		workerCap: 2_600,
		limits: LIMITS,
	};
	const profiled = estimatesFor([...main, ...svix], (_, i) =>
		estimate({ durationP90Ms: i === 0 ? 300_000 : 30_000 }),
	);

	test("max workers keeps one file per worker", () => {
		const plan = planRunSizing({
			...base,
			maxWorkers: 10,
			estimates: profiled,
		});
		expect(plan.sizing).toMatchObject({
			mode: "max_workers",
			workers: 10,
			filesPerWorker: 1,
		});
		expect(plan.swarm).toEqual({
			filesPerWorker: 1,
			soloFiles: [],
			shardWorkers: null,
		});
	});

	test("Auto with no profiles behaves exactly as before", () => {
		const plan = planRunSizing({ ...base, estimates: new Map() });
		expect(plan.sizing).toMatchObject({
			mode: "auto",
			workers: 44,
			filesPerWorker: 1,
		});
		expect(plan.swarm.shardWorkers).toBeNull();
	});

	test("Auto packs profiled files, keeps org-mutating ones alone and sizes each shard by LPT", () => {
		const orgMutating = main[5] as string;
		const plan = planRunSizing({
			...base,
			staticSolo: new Set([orgMutating]),
			estimates: profiled,
		});
		expect(plan.sizing).toMatchObject({
			mode: "auto",
			filesPerWorker: 4,
			packedFiles: 39,
			soloFiles: 1,
			targetWallMs: 315_000,
		});
		expect(plan.swarm.soloFiles).toEqual([orgMutating]);
		// 39 files: one 300 s + 38 × 30 s fit two 4-slot workers inside 315 s; ×1.3 → 3.
		expect(plan.swarm.shardWorkers).toEqual({ main: 3, solo: 1, svix: 2 });
		expect(plan.sizing.workers).toBe(6);
		expect(plan.sizing.predictedWallMs).toBeLessThanOrEqual(315_000);
	});

	test("a file that failed when packed but not alone learns to run alone", () => {
		const learned = main[7] as string;
		const estimates = new Map(profiled);
		estimates.set(learned, estimate({ failRate: 0.1, packedFailRate: 0.5 }));
		const plan = planRunSizing({ ...base, estimates });
		expect(plan.swarm.soloFiles).toEqual([learned]);
	});

	test("max files per worker packs every non-solo main file and caps capability shards", () => {
		const plan = planRunSizing({
			...base,
			maxFilesPerWorker: 3,
			staticSolo: new Set([main[0] as string]),
			estimates: new Map(),
		});
		expect(plan.swarm).toEqual({
			filesPerWorker: 3,
			soloFiles: [main[0]],
			shardWorkers: { main: 13, solo: 1, svix: 2 },
		});
		expect(plan.sizing.workers).toBe(16);
	});

	test("repeat runs never pack", () => {
		const plan = planRunSizing({ ...base, repeat: 3, estimates: profiled });
		expect(plan.sizing.filesPerWorker).toBe(1);
	});
});

test("static scan flags org-wide mutations and the solo marker only", () => {
	expect(
		soloReasons("await OrgService.update({ db, orgId, updates })"),
	).toEqual(["org config"]);
	expect(soloReasons('autumn.post("/organization/config", {})')).toEqual([
		"org config",
	]);
	expect(soloReasons("// tw:solo shares a fixed product id")).toEqual([
		"marker",
	]);
	expect(soloReasons("await updateServerRateLimitOverrides({})")).toEqual([
		"edge config / rate limits",
	]);
	expect(soloReasons('autumn.post("/platform/organizations", {})')).toEqual([]);
	expect(soloReasons("await advanceTestClock({ stripeCli })")).toEqual([]);
});
