/**
 * Unit test for the in-process L1 fronting the Redis org+features cache.
 * getOrgWithFeaturesCached runs once per queue message, so without an L1 every
 * message pays a Redis round trip — and during a misc-cache stall, a Postgres
 * one plus the write-back.
 *
 * Contract under test:
 *   New constants:
 *     - ORG_WITH_FEATURES_L1_TTL_MS = 5_000
 *     - ORG_WITH_FEATURES_L1_MAX_ENTRIES = 500
 *   New behaviors:
 *     1. L1 miss -> falls through to Redis; a Redis hit populates L1
 *     2. L1 hit -> value returned, Redis NOT called
 *     3. setCachedOrgWithFeatures write-through populates L1
 *     4. clearOrgWithFeaturesCache evicts the calling process's L1 (every env)
 *     5. A Redis error yields null and never poisons L1
 *     6. A positive entry stops being served once its TTL elapses
 *     7. Cache is LRU-bounded at max and never grows past it
 */

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { AppEnv } from "@autumn/shared";

// CI has no misc cache env, and getMiscMainRedis throws without one. These tests
// only need SET/GET/DEL semantics, so back the client with an in-memory map.
const realInstances = {
	...(await import("@/external/redis/miscCache/miscRedisInstances.js")),
};
const fakeStore = new Map<string, string>();
let redisGetCalls: string[] = [];
/** Set to make the next reads fail — the fake is typed `as never`, so spyOn
 *  can't stub it. */
let redisGetError: Error | null = null;
const fakeMiscRedis = {
	status: "ready",
	get: async (key: string) => {
		redisGetCalls.push(key);
		if (redisGetError) throw redisGetError;
		return fakeStore.get(key) ?? null;
	},
	set: async (key: string, value: string) => {
		fakeStore.set(key, String(value));
		return "OK";
	},
	del: async (key: string) => (fakeStore.delete(key) ? 1 : 0),
} as never;

mock.module("@/external/redis/miscCache/miscRedisInstances.js", () => ({
	getMiscMainRedis: () => fakeMiscRedis,
	getMiscBackupRedis: () => null,
}));

afterAll(() => {
	mock.module(
		"@/external/redis/miscCache/miscRedisInstances.js",
		() => realInstances,
	);
});

import {
	_orgWithFeaturesL1SizeForTesting,
	_resetOrgWithFeaturesL1ForTesting,
	buildOrgWithFeaturesCacheKey,
	clearOrgWithFeaturesCache,
	getCachedOrgWithFeatures,
	ORG_WITH_FEATURES_L1_MAX_ENTRIES,
	ORG_WITH_FEATURES_L1_TTL_MS,
	setCachedOrgWithFeatures,
} from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";

type CachedOrg = { org: { id: string }; features: unknown[] };

const buildOrgData = (orgId: string): CachedOrg => ({
	org: { id: orgId },
	features: [],
});

/** Unique per test so concurrent runs never share a key. */
const uniqueOrgId = (label: string) =>
	`org-l1-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Runs `fn` with the monotonic clock advanced by `deltaMs`. lru-cache stamps
 * TTLs with performance.now(), which neither fake timers nor setSystemTime can
 * move — spying on it is the only way to cross a TTL boundary without a sleep.
 */
const withAdvancedClock = async (deltaMs: number, fn: () => Promise<void>) => {
	// Macrotask yields on both edges: lru-cache caches its clock reading and
	// clears it via a 1ms setTimeout, so without them the spied clock is either
	// ignored or leaks a future timestamp into whatever runs next.
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
	fakeStore.clear();
	redisGetCalls = [];
	redisGetError = null;
});

afterEach(() => {
	_resetOrgWithFeaturesL1ForTesting();
});

describe("org-with-features L1 cache", () => {
	// ── Contracts 1 + 2 ────────────────────────────────────────────────────
	test("a Redis hit populates L1 so the next get skips Redis entirely", async () => {
		const orgId = uniqueOrgId("hit");
		const env = AppEnv.Live;

		await setCachedOrgWithFeatures({ orgId, env, data: buildOrgData(orgId) });
		_resetOrgWithFeaturesL1ForTesting();
		redisGetCalls = [];

		const first = await getCachedOrgWithFeatures<CachedOrg>({ orgId, env });
		expect(first?.org.id).toBe(orgId);
		expect(redisGetCalls).toHaveLength(1); // contract 1: fell through

		redisGetCalls = [];

		const second = await getCachedOrgWithFeatures<CachedOrg>({ orgId, env });
		expect(second?.org.id).toBe(orgId);
		expect(redisGetCalls).toHaveLength(0); // contract 2: served from L1
	});

	// ── Contract 3 ─────────────────────────────────────────────────────────
	test("setCachedOrgWithFeatures write-through makes the next get an L1 hit", async () => {
		const orgId = uniqueOrgId("write-through");
		const env = AppEnv.Live;

		await setCachedOrgWithFeatures({ orgId, env, data: buildOrgData(orgId) });

		const result = await getCachedOrgWithFeatures<CachedOrg>({ orgId, env });

		expect(result?.org.id).toBe(orgId);
		expect(redisGetCalls).toHaveLength(0);
	});

	// ── Contract 4 ─────────────────────────────────────────────────────────
	test("clearOrgWithFeaturesCache evicts this process's L1 entry for every env", async () => {
		const orgId = uniqueOrgId("clear");

		for (const env of [AppEnv.Live, AppEnv.Sandbox]) {
			await setCachedOrgWithFeatures({ orgId, env, data: buildOrgData(orgId) });
		}
		expect(_orgWithFeaturesL1SizeForTesting()).toBe(2);

		// Omitted env clears both.
		await clearOrgWithFeaturesCache({ orgId });

		expect(_orgWithFeaturesL1SizeForTesting()).toBe(0);
		for (const env of [AppEnv.Live, AppEnv.Sandbox]) {
			// L1 and Redis are both gone -> the read must go to Redis and miss.
			expect(await getCachedOrgWithFeatures({ orgId, env })).toBeNull();
		}
		expect(redisGetCalls).toHaveLength(2);
	});

	// ── Contract 5 ─────────────────────────────────────────────────────────
	test("a Redis error yields null rather than throwing, and never poisons L1", async () => {
		const orgId = uniqueOrgId("redis-error");
		redisGetError = new Error("boom");

		const result = await getCachedOrgWithFeatures({ orgId, env: AppEnv.Live });

		expect(result).toBeNull();
		expect(_orgWithFeaturesL1SizeForTesting()).toBe(0);
	});

	// ── Contract 6 ─────────────────────────────────────────────────────────
	test("a positive L1 entry stops being served once its TTL elapses", async () => {
		const orgId = uniqueOrgId("ttl");
		const env = AppEnv.Live;

		await setCachedOrgWithFeatures({ orgId, env, data: buildOrgData(orgId) });

		await withAdvancedClock(ORG_WITH_FEATURES_L1_TTL_MS + 400, async () => {
			redisGetCalls = [];

			const result = await getCachedOrgWithFeatures<CachedOrg>({ orgId, env });

			expect(redisGetCalls).toHaveLength(1); // went back to Redis
			expect(result?.org.id).toBe(orgId); // Redis still had it (60s TTL)
		});
	});
});

// ── Contract 7 ─────────────────────────────────────────────────────────────
describe("org-with-features L1 cache: bounded size", () => {
	test("evicts LRU-style at max and never grows unbounded", async () => {
		const env = AppEnv.Live;
		const overfill = ORG_WITH_FEATURES_L1_MAX_ENTRIES + 50;

		for (let i = 0; i < overfill; i++) {
			await setCachedOrgWithFeatures({
				orgId: `bounded-${i}`,
				env,
				data: buildOrgData(`bounded-${i}`),
			});
		}

		expect(_orgWithFeaturesL1SizeForTesting()).toBe(
			ORG_WITH_FEATURES_L1_MAX_ENTRIES,
		);
		redisGetCalls = [];

		// The oldest key was evicted -> must go back to Redis.
		await getCachedOrgWithFeatures({ orgId: "bounded-0", env });
		expect(redisGetCalls).toEqual([
			buildOrgWithFeaturesCacheKey({ orgId: "bounded-0", env }),
		]);

		redisGetCalls = [];

		// The most recent key survived -> served from L1.
		await getCachedOrgWithFeatures({ orgId: `bounded-${overfill - 1}`, env });
		expect(redisGetCalls).toHaveLength(0);
	});
});
