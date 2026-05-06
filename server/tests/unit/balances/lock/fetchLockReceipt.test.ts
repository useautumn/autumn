import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Redis } from "ioredis";

const sharedRedis = { name: "shared" } as unknown as Redis;
const dedicatedRedis = { name: "dedicated" } as unknown as Redis;

const mockState = {
	jsonGetResult: null as string | null,
	v2ResultsByRedis: new Map<object, { found: boolean }>(),
	v2Calls: [] as object[],
};

mock.module("@/external/redis/initRedis.js", () => ({
	redis: {
		call: async () => mockState.jsonGetResult,
	},
}));

mock.module("@/external/redis/orgRedisPool.js", () => ({
	getOrgRedis: () => dedicatedRedis,
}));

mock.module("@/external/redis/resolveRedisV2.js", () => ({
	resolveRedisV2: () => sharedRedis,
}));

mock.module("@/utils/cacheUtils/cacheUtils.js", () => ({
	tryRedisRead: async (operation: () => Promise<unknown>) => operation(),
}));

mock.module(
	"@/internal/balances/utils/lockV2/fetchAndClaimLockReceiptV2.js",
	() => ({
		fetchAndClaimLockReceiptV2: async ({
			redisInstance,
		}: {
			redisInstance: object;
		}) => {
			mockState.v2Calls.push(redisInstance);
			const result = mockState.v2ResultsByRedis.get(redisInstance);

			if (!result?.found) return { found: false };

			return {
				found: true,
				claimed: true,
				lockReceiptKey: "lock:receipt",
				redisInstance,
				receipt: {
					customer_id: "customer_123",
					feature_id: "messages",
					items: [],
				},
			};
		},
	}),
);

import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";

const makeContext = ({ migrationPercent }: { migrationPercent: number }) =>
	({
		org: {
			id: "org_123",
			redis_config: {
				connectionString: "encrypted",
				url: "dragonfly.internal:6379",
				migrationPercent,
				previousMigrationPercent: 0,
				migrationChangedAt: 1,
			},
		},
		env: "sandbox",
		redisV2: sharedRedis,
	}) as never;

beforeEach(() => {
	mockState.jsonGetResult = null;
	mockState.v2ResultsByRedis.clear();
	mockState.v2Calls = [];
});

describe("fetchLockReceipt", () => {
	test("checks dedicated Redis during an org Redis migration and returns the source instance", async () => {
		mockState.v2ResultsByRedis.set(sharedRedis, { found: false });
		mockState.v2ResultsByRedis.set(dedicatedRedis, { found: true });

		const result = await fetchLockReceipt({
			ctx: makeContext({ migrationPercent: 50 }),
			lockId: "lock_123",
		});

		expect(result.source).toBe("redis_v2");
		if (result.source !== "redis_v2")
			throw new Error("Expected Redis V2 receipt");
		expect(result.redisInstance).toBe(dedicatedRedis);
		expect(mockState.v2Calls).toEqual([sharedRedis, dedicatedRedis]);
	});

	test("does not check dedicated Redis when the org migration is complete", async () => {
		mockState.v2ResultsByRedis.set(sharedRedis, { found: true });

		const result = await fetchLockReceipt({
			ctx: makeContext({ migrationPercent: 100 }),
			lockId: "lock_123",
		});

		expect(result.source).toBe("redis_v2");
		if (result.source !== "redis_v2")
			throw new Error("Expected Redis V2 receipt");
		expect(result.redisInstance).toBe(sharedRedis);
		expect(mockState.v2Calls).toEqual([sharedRedis]);
	});
});
