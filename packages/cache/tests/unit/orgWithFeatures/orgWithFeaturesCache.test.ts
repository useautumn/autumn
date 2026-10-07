/**
 * The org+features cache and its in-process L1: a hit fills L1, a write goes
 * through it, a clear empties it, a failing Redis never poisons it, it is
 * bounded by TTL and size, and a read-through burst shares one lookup.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	_orgWithFeaturesL1SizeForTesting,
	_resetOrgWithFeaturesL1ForTesting,
	buildOrgWithFeaturesCacheKey,
	clearOrgWithFeaturesCache,
	getCachedOrgWithFeatures,
	ORG_WITH_FEATURES_L1_MAX_ENTRIES,
	ORG_WITH_FEATURES_L1_TTL_MS,
	readThroughOrgWithFeatures,
	setCachedOrgWithFeatures,
} from "../../../src/orgWithFeatures/orgWithFeaturesCache.js";
import { createFakeReadThroughCache } from "../utils/fakeReadThroughCache.js";

type CachedOrg = { org: { id: string }; features: unknown[] };

const cache = createFakeReadThroughCache();
const { ctx } = cache;

const orgData = (orgId: string): CachedOrg => ({
	org: { id: orgId },
	features: [],
});

const redisGets = () =>
	cache.main.calls.filter((call) => call.startsWith("get:"));

/** lru-cache stamps TTLs with performance.now(), so crossing one means moving that clock. */
const withAdvancedClock = async (deltaMs: number, fn: () => Promise<void>) => {
	const yieldMacrotask = () => new Promise((resolve) => setTimeout(resolve, 5));
	await yieldMacrotask();
	const realPerfNow = performance.now.bind(performance);
	const clock = spyOn(performance, "now").mockImplementation(
		() => realPerfNow() + deltaMs,
	);
	try {
		await fn();
	} finally {
		clock.mockRestore();
		await yieldMacrotask();
	}
};

beforeEach(() => {
	_resetOrgWithFeaturesL1ForTesting();
	cache.reset();
});

afterEach(() => {
	_resetOrgWithFeaturesL1ForTesting();
});

describe("org-with-features cache", () => {
	test("a Redis hit fills L1, so the next get skips Redis", async () => {
		const env = AppEnv.Live;
		await setCachedOrgWithFeatures({
			ctx,
			orgId: "org_1",
			env,
			data: orgData("org_1"),
		});
		_resetOrgWithFeaturesL1ForTesting();
		cache.main.calls.length = 0;

		const first = await getCachedOrgWithFeatures<CachedOrg>({
			ctx,
			orgId: "org_1",
			env,
		});
		expect(first?.org.id).toBe("org_1");
		expect(redisGets()).toHaveLength(1);

		cache.main.calls.length = 0;
		const second = await getCachedOrgWithFeatures<CachedOrg>({
			ctx,
			orgId: "org_1",
			env,
		});
		expect(second?.org.id).toBe("org_1");
		expect(redisGets()).toHaveLength(0);
	});

	test("a write goes through L1 and lands in Redis with the 60s TTL", async () => {
		const env = AppEnv.Live;
		await setCachedOrgWithFeatures({
			ctx,
			orgId: "org_1",
			env,
			data: orgData("org_1"),
		});

		expect(cache.main.calls).toEqual([
			`set:${buildOrgWithFeaturesCacheKey({ orgId: "org_1", env })}:EX:60`,
		]);
		const result = await getCachedOrgWithFeatures<CachedOrg>({
			ctx,
			orgId: "org_1",
			env,
		});
		expect(result?.org.id).toBe("org_1");
		expect(redisGets()).toHaveLength(0);
	});

	test("a clear without an env drops both envs from L1 and from every target", async () => {
		for (const env of [AppEnv.Live, AppEnv.Sandbox])
			await setCachedOrgWithFeatures({
				ctx,
				orgId: "org_1",
				env,
				data: orgData("org_1"),
			});
		expect(_orgWithFeaturesL1SizeForTesting()).toBe(2);

		await clearOrgWithFeaturesCache({ ctx, orgId: "org_1" });

		expect(_orgWithFeaturesL1SizeForTesting()).toBe(0);
		for (const redis of [cache.main, cache.backup])
			expect(
				redis.calls.filter((call) => call.startsWith("del:")),
			).toHaveLength(2);
		for (const env of [AppEnv.Live, AppEnv.Sandbox])
			expect(
				await getCachedOrgWithFeatures({ ctx, orgId: "org_1", env }),
			).toBeNull();
	});

	test("an unavailable Redis reads as a miss and never poisons L1", async () => {
		cache.setStatus("reconnecting");
		const result = await getCachedOrgWithFeatures({
			ctx,
			orgId: "org_1",
			env: AppEnv.Live,
		});
		expect(result).toBeNull();
		expect(_orgWithFeaturesL1SizeForTesting()).toBe(0);
	});

	test("an L1 entry stops being served once its TTL elapses", async () => {
		const env = AppEnv.Live;
		await setCachedOrgWithFeatures({
			ctx,
			orgId: "org_1",
			env,
			data: orgData("org_1"),
		});

		await withAdvancedClock(ORG_WITH_FEATURES_L1_TTL_MS + 400, async () => {
			cache.main.calls.length = 0;
			const result = await getCachedOrgWithFeatures<CachedOrg>({
				ctx,
				orgId: "org_1",
				env,
			});
			expect(redisGets()).toHaveLength(1);
			expect(result?.org.id).toBe("org_1");
		});
	});

	test("L1 evicts least-recently-used past its size and never grows past it", async () => {
		const env = AppEnv.Live;
		const overfill = ORG_WITH_FEATURES_L1_MAX_ENTRIES + 50;
		for (let index = 0; index < overfill; index++)
			await setCachedOrgWithFeatures({
				ctx,
				orgId: `org_${index}`,
				env,
				data: orgData(`org_${index}`),
			});
		expect(_orgWithFeaturesL1SizeForTesting()).toBe(
			ORG_WITH_FEATURES_L1_MAX_ENTRIES,
		);

		cache.main.calls.length = 0;
		await getCachedOrgWithFeatures({ ctx, orgId: "org_0", env });
		expect(redisGets()).toEqual([
			`get:${buildOrgWithFeaturesCacheKey({ orgId: "org_0", env })}`,
		]);

		cache.main.calls.length = 0;
		await getCachedOrgWithFeatures({ ctx, orgId: `org_${overfill - 1}`, env });
		expect(redisGets()).toHaveLength(0);
	});
	test("a read-through burst on a cold cache reads Redis once and loads once", async () => {
		const env = AppEnv.Live;
		let loads = 0;
		const load = async () => {
			loads++;
			await Bun.sleep(2);
			return orgData("org_1");
		};

		const results = await Promise.all(
			Array.from({ length: 64 }, () =>
				readThroughOrgWithFeatures<CachedOrg>({
					ctx,
					orgId: "org_1",
					env,
					load,
				}),
			),
		);

		expect(results.every((result) => result?.org.id === "org_1")).toBe(true);
		expect(redisGets()).toHaveLength(1);
		expect(loads).toBe(1);
		expect(
			cache.main.store.has(
				buildOrgWithFeaturesCacheKey({ orgId: "org_1", env }),
			),
		).toBe(true);
	});

	test("a read-through load is written back, so the next read is an L1 hit", async () => {
		const env = AppEnv.Live;
		const load = async () => orgData("org_1");
		await readThroughOrgWithFeatures({ ctx, orgId: "org_1", env, load });

		cache.main.calls.length = 0;
		const again = await readThroughOrgWithFeatures<CachedOrg>({
			ctx,
			orgId: "org_1",
			env,
			load: async () => {
				throw new Error("should not load");
			},
		});
		expect(again?.org.id).toBe("org_1");
		expect(cache.main.calls).toEqual([]);
	});

	test("a failed read-through lookup is not shared with the next caller", async () => {
		const env = AppEnv.Live;
		await expect(
			readThroughOrgWithFeatures({
				ctx,
				orgId: "org_1",
				env,
				load: async () => {
					throw new Error("postgres down");
				},
			}),
		).rejects.toThrow("postgres down");

		const result = await readThroughOrgWithFeatures<CachedOrg>({
			ctx,
			orgId: "org_1",
			env,
			load: async () => orgData("org_1"),
		});
		expect(result?.org.id).toBe("org_1");
	});

	test("a missing org is not cached", async () => {
		const env = AppEnv.Live;
		let loads = 0;
		const load = async () => {
			loads++;
			return null;
		};
		await readThroughOrgWithFeatures({ ctx, orgId: "org_1", env, load });
		await readThroughOrgWithFeatures({ ctx, orgId: "org_1", env, load });
		expect(loads).toBe(2);
		expect(_orgWithFeaturesL1SizeForTesting()).toBe(0);
	});
});
