/**
 * The org+features cache and its in-process L1: a hit fills L1, a write goes
 * through it, a clear empties it, a failing Redis never poisons it, and it is
 * bounded by TTL and size.
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
});
