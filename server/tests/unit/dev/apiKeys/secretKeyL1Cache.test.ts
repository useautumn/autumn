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
import { createFakeMiscCache } from "../../utils/fakeMiscCache.js";

const realGetMiscCache = {
	...(await import("@/external/redis/miscCache/getMiscCache.js")),
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

const fakeMiscCache = createFakeMiscCache({ main: fakeMiscRedis });
mock.module("@/external/redis/miscCache/getMiscCache.js", () => ({
	getMiscCache: () => fakeMiscCache,
}));

afterAll(() => {
	mock.module(
		"@/external/redis/miscCache/getMiscCache.js",
		() => realGetMiscCache,
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

const uniqueKey = (label: string) =>
	`l1-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

const mainRedis = () => getRegionalRedis(currentRegion);

let redisGet: ReturnType<typeof spyOn>;

beforeEach(() => {
	_resetSecretKeyL1ForTesting();
	redisGet = spyOn(mainRedis(), "get");
});

afterEach(() => {
	redisGet.mockRestore();
	_resetSecretKeyL1ForTesting();
});

describe("secret-key L1 cache", () => {
	test("a Redis hit populates L1 so the next get skips Redis entirely", async () => {
		const hashedKey = uniqueKey("hit");
		const data = buildVerificationData("org_hit");

		await setCachedSecretKeyVerification({ hashedKey, data });
		_resetSecretKeyL1ForTesting();
		redisGet.mockClear();

		const first = await getCachedSecretKeyVerification({ hashedKey });
		expect(first?.org.id).toBe("org_hit");
		expect(redisGet).toHaveBeenCalledTimes(1);

		redisGet.mockClear();

		const second = await getCachedSecretKeyVerification({ hashedKey });
		expect(second?.org.id).toBe("org_hit");
		expect(redisGet).not.toHaveBeenCalled();

		await clearSecretKeyCache({ hashedKey });
	});

	test("skipL1 bypasses a stale L1 entry and returns the Redis value", async () => {
		const hashedKey = uniqueKey("skip-l1");

		await setCachedSecretKeyVerification({
			hashedKey,
			data: buildVerificationData("org_stale"),
		});
		fakeStore.set(
			buildSecretKeyCacheKey(hashedKey),
			JSON.stringify(buildVerificationData("org_fresh")),
		);
		redisGet.mockClear();

		const viaL1 = await getCachedSecretKeyVerification({ hashedKey });
		expect(viaL1?.org.id).toBe("org_stale");
		expect(redisGet).not.toHaveBeenCalled();

		const fresh = await getCachedSecretKeyVerification({
			hashedKey,
			skipL1: true,
		});
		expect(fresh?.org.id).toBe("org_fresh");
		expect(redisGet).toHaveBeenCalledTimes(1);

		redisGet.mockClear();
		const afterRefresh = await getCachedSecretKeyVerification({ hashedKey });
		expect(afterRefresh?.org.id).toBe("org_fresh");
		expect(redisGet).not.toHaveBeenCalled();

		await clearSecretKeyCache({ hashedKey });
	});

	test("L1 miss + Redis miss returns null", async () => {
		const hashedKey = uniqueKey("full-miss");

		const result = await getCachedSecretKeyVerification({ hashedKey });

		expect(result).toBeNull();
		expect(redisGet).toHaveBeenCalledTimes(1);
	});

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

	test("clearSecretKeyCache evicts this process's L1 entry", async () => {
		const hashedKey = uniqueKey("clear");
		const data = buildVerificationData("org_clear");

		await setCachedSecretKeyVerification({ hashedKey, data });
		expect(_secretKeyL1SizeForTesting()).toBeGreaterThan(0);

		await clearSecretKeyCache({ hashedKey });
		redisGet.mockClear();

		const result = await getCachedSecretKeyVerification({ hashedKey });
		expect(redisGet).toHaveBeenCalledTimes(1);
		expect(result).toBeNull();
	});

	test("a Redis error yields null rather than throwing", async () => {
		const hashedKey = uniqueKey("redis-error");
		redisGet.mockImplementation(() => Promise.reject(new Error("boom")));

		const result = await getCachedSecretKeyVerification({ hashedKey });

		expect(result).toBeNull();
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

	test("negative TTL is strictly shorter than the positive TTL", () => {
		expect(SECRET_KEY_L1_NEGATIVE_TTL_MS).toBeLessThan(SECRET_KEY_L1_TTL_MS);
		expect(SECRET_KEY_L1_NEGATIVE_TTL_MS).toBeGreaterThanOrEqual(1_000);
		expect(SECRET_KEY_L1_NEGATIVE_TTL_MS).toBeLessThanOrEqual(2_000);
		expect(SECRET_KEY_L1_TTL_MS).toBe(5_000);
		expect(SECRET_KEY_L1_MAX_ENTRIES).toBe(5_000);
	});

	test("a resolved-to-nothing lookup is cached, sparing Redis on the retry", async () => {
		const hashedKey = uniqueKey("negative");

		expect(await getCachedSecretKeyVerification({ hashedKey })).toBeNull();
		expect(redisGet).toHaveBeenCalledTimes(1);

		redisGet.mockClear();

		expect(await getCachedSecretKeyVerification({ hashedKey })).toBeNull();
		expect(redisGet).not.toHaveBeenCalled();
	});

	test("the negative entry expires while a same-age positive entry is still served", async () => {
		const negativeKey = uniqueKey("neg-expiry");
		const positiveKey = uniqueKey("pos-still-live");

		await setCachedSecretKeyVerification({
			hashedKey: positiveKey,
			data: buildVerificationData("org_pos"),
		});
		await getCachedSecretKeyVerification({ hashedKey: negativeKey });

		await withAdvancedClock(SECRET_KEY_L1_NEGATIVE_TTL_MS + 400, async () => {
			redisGet.mockClear();

			expect(
				await getCachedSecretKeyVerification({ hashedKey: negativeKey }),
			).toBeNull();
			expect(redisGet).toHaveBeenCalledTimes(1);

			redisGet.mockClear();

			const positive = await getCachedSecretKeyVerification({
				hashedKey: positiveKey,
			});
			expect(positive?.org.id).toBe("org_pos");
			expect(redisGet).not.toHaveBeenCalled();
		});

		await clearSecretKeyCache({ hashedKey: positiveKey });
	});

	test("a positive L1 entry stops being served once its TTL elapses", async () => {
		const hashedKey = uniqueKey("pos-expiry");

		await setCachedSecretKeyVerification({
			hashedKey,
			data: buildVerificationData("org_ttl"),
		});

		await withAdvancedClock(SECRET_KEY_L1_TTL_MS + 400, async () => {
			redisGet.mockClear();

			const result = await getCachedSecretKeyVerification({ hashedKey });

			expect(redisGet).toHaveBeenCalledTimes(1);
			expect(result?.org.id).toBe("org_ttl");
		});

		await clearSecretKeyCache({ hashedKey });
	});
});

describe("secret-key L1 cache: bounded size", () => {
	test("evicts LRU-style at max and never grows unbounded", async () => {
		_resetSecretKeyL1ForTesting();

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

			await getCachedSecretKeyVerification({ hashedKey: "bounded-0" });
			expect(stub).toHaveBeenCalledWith(buildSecretKeyCacheKey("bounded-0"));

			stub.mockClear();

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
