/**
 * TDD test for the in-process L1 cache fronting the Redis secret-key
 * verification cache. `secret-key-cache:get` is ~85% of the legacy Redis
 * client's traffic; an L1 removes it from the request path.
 *
 * Contract under test:
 *   New constants:
 *     - SECRET_KEY_L1_TTL_MS = 5_000 (positive entries)
 *     - SECRET_KEY_L1_NEGATIVE_TTL_MS = 1_000..2_000 (negative entries)
 *     - SECRET_KEY_L1_MAX_ENTRIES = 5_000
 *   New behaviors:
 *     1. L1 hit -> value returned, Redis NOT called
 *     2. L1 miss -> falls through to Redis; a Redis hit populates L1
 *     3. L1 miss + Redis miss -> null (verifyKey then hits Postgres)
 *     4. Positive entry stops being served after its TTL; next call re-reads Redis
 *     5. Cache is LRU-bounded at max and never grows past it
 *     6. Negative lookups are cached with a STRICTLY SHORTER TTL than positive
 *     7. setCachedSecretKeyVerification write-through populates/refreshes L1
 *     8. clearSecretKeyCache evicts the calling process's L1 entry (local only)
 *     9. A Redis error yields null, never a throw (tryRedisOp swallow preserved)
 *
 * Pre-impl red: no L1 exists, so every get is a Redis call and none of the
 * L1 constants/seams are exported.
 * Post-impl green: an LRUCache in cacheApiKeyUtils.ts fronts every Redis read.
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

// CI has no CACHE_URL, and getMiscMainRedis throws without one. These tests
// only need SET/GET/DEL semantics, so back the client with an in-memory map.
const realInstances = {
	...(await import("@/external/redis/miscCache/miscRedisInstances.js")),
};
const fakeStore = new Map<string, string>();
const fakeMiscRedis = {
	status: "ready",
	get: async (key: string) => fakeStore.get(key) ?? null,
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
	_resetSecretKeyL1ForTesting,
	_secretKeyL1SizeForTesting,
	buildSecretKeyCacheKey,
	clearSecretKeyCache,
	getCachedSecretKeyVerification,
	SECRET_KEY_L1_MAX_ENTRIES,
	SECRET_KEY_L1_NEGATIVE_TTL_MS,
	SECRET_KEY_L1_TTL_MS,
	setCachedSecretKeyVerification,
} from "@/external/redis/actions/secretKeyCache/secretKeyCache.js";
import { currentRegion, getRegionalRedis } from "@/external/redis/initRedis.js";
import type { ApiKeyVerificationData } from "@/internal/dev/repos/getApiKeyVerificationData.js";

const buildVerificationData = (orgId: string) =>
	({
		org: { id: orgId, slug: orgId },
		features: [],
		pendingMigrations: [],
		fullOrg: { id: orgId },
		env: "live",
		userId: null,
		user: null,
		scopes: null,
	}) as unknown as ApiKeyVerificationData;

/** Unique per test so concurrent runs never share a Redis key. */
const uniqueKey = (label: string) =>
	`l1-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// The exported `redis` is a Proxy over an empty target, so spies must go on the
// concrete client it resolves to or they are never read back.
const mainRedis = () => getRegionalRedis(currentRegion);

let redisGet: ReturnType<typeof spyOn>;

beforeEach(() => {
	_resetSecretKeyL1ForTesting();
	// Spy, not stub: bun's spyOn calls through, so the real Redis path still runs.
	redisGet = spyOn(mainRedis(), "get");
});

afterEach(() => {
	redisGet.mockRestore();
	_resetSecretKeyL1ForTesting();
});

describe("secret-key L1 cache", () => {
	// ── Contract 1 + 2: miss falls through to Redis, hit populates L1, ──────
	// ── and the next read is served locally with zero Redis calls. ─────────
	test("a Redis hit populates L1 so the next get skips Redis entirely", async () => {
		const hashedKey = uniqueKey("hit");
		const data = buildVerificationData("org_hit");

		// Seed Redis directly, then clear L1 so the next read MUST go to Redis.
		await setCachedSecretKeyVerification({ hashedKey, data });
		_resetSecretKeyL1ForTesting();
		redisGet.mockClear();

		const first = await getCachedSecretKeyVerification({ hashedKey });
		expect(first?.org.id).toBe("org_hit");
		expect(redisGet).toHaveBeenCalledTimes(1); // contract 2: fell through

		redisGet.mockClear();

		const second = await getCachedSecretKeyVerification({ hashedKey });
		expect(second?.org.id).toBe("org_hit");
		expect(redisGet).not.toHaveBeenCalled(); // contract 1: served from L1

		await clearSecretKeyCache({ hashedKey });
	});

	// ── Contract 3: full miss returns null so verifyKey falls to Postgres ───
	test("L1 miss + Redis miss returns null", async () => {
		const hashedKey = uniqueKey("full-miss");

		const result = await getCachedSecretKeyVerification({ hashedKey });

		expect(result).toBeNull();
		expect(redisGet).toHaveBeenCalledTimes(1);
	});

	// ── Contract 7: write-through ──────────────────────────────────────────
	test("setCachedSecretKeyVerification write-through makes the next get an L1 hit", async () => {
		const hashedKey = uniqueKey("write-through");
		const data = buildVerificationData("org_wt");

		await setCachedSecretKeyVerification({ hashedKey, data });
		redisGet.mockClear();

		const result = await getCachedSecretKeyVerification({ hashedKey });

		expect(result?.org.id).toBe("org_wt");
		expect(redisGet).not.toHaveBeenCalled();

		await clearSecretKeyCache({ hashedKey });
	});

	// ── Contract 8: local eviction ─────────────────────────────────────────
	test("clearSecretKeyCache evicts this process's L1 entry", async () => {
		const hashedKey = uniqueKey("clear");
		const data = buildVerificationData("org_clear");

		await setCachedSecretKeyVerification({ hashedKey, data });
		expect(_secretKeyL1SizeForTesting()).toBeGreaterThan(0);

		await clearSecretKeyCache({ hashedKey });
		redisGet.mockClear();

		// L1 entry gone -> the next read has to consult Redis again.
		const result = await getCachedSecretKeyVerification({ hashedKey });
		expect(redisGet).toHaveBeenCalledTimes(1);
		expect(result).toBeNull(); // clear removed the Redis copy too
	});

	// ── Contract 9: Redis failure is a miss, not a throw ───────────────────
	test("a Redis error yields null rather than throwing", async () => {
		const hashedKey = uniqueKey("redis-error");
		redisGet.mockImplementation(() => Promise.reject(new Error("boom")));

		const result = await getCachedSecretKeyVerification({ hashedKey });

		expect(result).toBeNull();
		// A transient Redis failure must not poison L1 with a negative entry.
		expect(_secretKeyL1SizeForTesting()).toBe(0);
	});
});

describe("secret-key L1 cache: TTLs", () => {
	beforeEach(() => {
		_resetSecretKeyL1ForTesting();
		redisGet = spyOn(mainRedis(), "get");
	});

	afterEach(() => {
		redisGet.mockRestore();
		_resetSecretKeyL1ForTesting();
	});

	// ── Contract 6 (constants): negative TTL is strictly shorter ───────────
	test("negative TTL is strictly shorter than the positive TTL", () => {
		expect(SECRET_KEY_L1_NEGATIVE_TTL_MS).toBeLessThan(SECRET_KEY_L1_TTL_MS);
		expect(SECRET_KEY_L1_NEGATIVE_TTL_MS).toBeGreaterThanOrEqual(1_000);
		expect(SECRET_KEY_L1_NEGATIVE_TTL_MS).toBeLessThanOrEqual(2_000);
		expect(SECRET_KEY_L1_TTL_MS).toBe(5_000);
		expect(SECRET_KEY_L1_MAX_ENTRIES).toBe(5_000);
	});

	// ── Contract 6 (behavior): negative lookups are cached ─────────────────
	test("a resolved-to-nothing lookup is cached, sparing Redis on the retry", async () => {
		const hashedKey = uniqueKey("negative");

		expect(await getCachedSecretKeyVerification({ hashedKey })).toBeNull();
		expect(redisGet).toHaveBeenCalledTimes(1);

		redisGet.mockClear();

		// Second invalid-key lookup is served from the negative L1 entry.
		expect(await getCachedSecretKeyVerification({ hashedKey })).toBeNull();
		expect(redisGet).not.toHaveBeenCalled();
	});

	// ── Contract 6 (expiry), asserted separately from the positive TTL ─────
	test("the negative entry expires while a same-age positive entry is still served", async () => {
		const negativeKey = uniqueKey("neg-expiry");
		const positiveKey = uniqueKey("pos-still-live");

		await setCachedSecretKeyVerification({
			hashedKey: positiveKey,
			data: buildVerificationData("org_pos"),
		});
		await getCachedSecretKeyVerification({ hashedKey: negativeKey });

		await Bun.sleep(SECRET_KEY_L1_NEGATIVE_TTL_MS + 400);
		redisGet.mockClear();

		// Negative entry is gone -> back to Redis.
		expect(
			await getCachedSecretKeyVerification({ hashedKey: negativeKey }),
		).toBeNull();
		expect(redisGet).toHaveBeenCalledTimes(1);

		redisGet.mockClear();

		// Positive entry of the same age is still live -> no Redis call.
		const positive = await getCachedSecretKeyVerification({
			hashedKey: positiveKey,
		});
		expect(positive?.org.id).toBe("org_pos");
		expect(redisGet).not.toHaveBeenCalled();

		await clearSecretKeyCache({ hashedKey: positiveKey });
	});

	// ── Contract 4: positive TTL expiry ────────────────────────────────────
	test("a positive L1 entry stops being served once its TTL elapses", async () => {
		const hashedKey = uniqueKey("pos-expiry");

		await setCachedSecretKeyVerification({
			hashedKey,
			data: buildVerificationData("org_ttl"),
		});

		await Bun.sleep(SECRET_KEY_L1_TTL_MS + 400);
		redisGet.mockClear();

		const result = await getCachedSecretKeyVerification({ hashedKey });

		expect(redisGet).toHaveBeenCalledTimes(1); // went back to Redis
		expect(result?.org.id).toBe("org_ttl"); // Redis still had it (3600s TTL)

		await clearSecretKeyCache({ hashedKey });
		// Sleeps past bun's default 5s test timeout — needs its own budget.
	}, 15_000);
});

// ── Contract 5: bounded size / LRU eviction ────────────────────────────────
describe("secret-key L1 cache: bounded size", () => {
	test("evicts LRU-style at max and never grows unbounded", async () => {
		_resetSecretKeyL1ForTesting();

		// Stub Redis so this stays in-process: we are testing L1 eviction, not IO.
		const stub = spyOn(mainRedis(), "get").mockImplementation((key: string) =>
			Promise.resolve(
				JSON.stringify(buildVerificationData(`org_${key.slice(-6)}`)),
			),
		);

		try {
			const overfill = SECRET_KEY_L1_MAX_ENTRIES + 100;
			for (let i = 0; i < overfill; i++) {
				await getCachedSecretKeyVerification({ hashedKey: `bounded-${i}` });
			}

			expect(_secretKeyL1SizeForTesting()).toBe(SECRET_KEY_L1_MAX_ENTRIES);
			expect(_secretKeyL1SizeForTesting()).toBeLessThan(overfill);

			stub.mockClear();

			// The oldest key was evicted -> must go back to Redis.
			await getCachedSecretKeyVerification({ hashedKey: "bounded-0" });
			expect(stub).toHaveBeenCalledWith(buildSecretKeyCacheKey("bounded-0"));

			stub.mockClear();

			// The most recent key survived -> served from L1.
			await getCachedSecretKeyVerification({
				hashedKey: `bounded-${overfill - 1}`,
			});
			expect(stub).not.toHaveBeenCalled();
		} finally {
			stub.mockRestore();
			_resetSecretKeyL1ForTesting();
		}
	});
});
