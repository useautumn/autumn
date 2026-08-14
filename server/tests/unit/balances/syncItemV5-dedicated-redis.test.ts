import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const dedicatedRedis = {};
const sharedRedis = {};
let claimedRedis: unknown;
let syncedRedis: unknown;
let syncUnsafe = false;
const clearSyncClaimMock = mock(
	(_args: { scope: Record<string, unknown> }) => {},
);

await mockModuleWithRestore("@/external/redis/orgRedisPool.js", () => ({
	getOrgRedis: () => dedicatedRedis,
}));

await mockModuleWithRestore(
	"@/internal/balances/utils/sync/dirtyState/claimSyncDirty.js",
	() => ({
		claimSyncDirty: ({ redis }: { redis: unknown }) => {
			claimedRedis = redis;
			return {
				generation: "claim-generation-1",
				cusEntIds: ["ce_1"],
				rolloverIds: [],
				modifiedCusEntIdsByFeatureId: { messages: ["ce_1"] },
				usageWindowUpdates: [],
			};
		},
		clearSyncClaim: clearSyncClaimMock,
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/utils/sync/syncItemV4.js",
	() => ({
		syncItemV4: ({ redis }: { redis: unknown }) => {
			syncedRedis = redis;
			if (syncUnsafe) throw new Error("unsafe");
		},
	}),
);

const { syncItemV5 } = await import(
	"@/internal/balances/utils/sync/syncItemV5.js"
);
describe("syncItemV5 Redis routing", () => {
	beforeEach(() => {
		claimedRedis = undefined;
		syncedRedis = undefined;
		syncUnsafe = false;
		clearSyncClaimMock.mockClear();
	});

	test("claims dirty state from the org Redis for dedicated writes", async () => {
		await syncItemV5({
			ctx: {
				org: { id: "org_1", redis_config: {} },
				redisV2: sharedRedis,
				logger: { debug: () => {} },
			} as never,
			payload: {
				customerId: "customer_1",
				orgId: "org_1",
				env: AppEnv.Sandbox,
				redisInstance: "org",
				timestamp: 0,
			},
		});

		expect(claimedRedis).toBe(dedicatedRedis);
		expect(syncedRedis).toBe(dedicatedRedis);
		expect(clearSyncClaimMock).toHaveBeenCalledWith({
			redis: dedicatedRedis,
			scope: {
				orgId: "org_1",
				env: AppEnv.Sandbox,
				customerId: "customer_1",
			},
			generation: "claim-generation-1",
		});
	});

	test("clears the owned claim after a successful sync", async () => {
		await syncItemV5({
			ctx: {
				org: { id: "org_1" },
				redisV2: sharedRedis,
				logger: { debug: () => {} },
			} as never,
			payload: {
				customerId: "customer_1",
				orgId: "org_1",
				env: AppEnv.Sandbox,
				timestamp: 0,
			},
		});

		expect(clearSyncClaimMock).toHaveBeenCalledTimes(1);
	});

	test("retains the claim when sync throws", async () => {
		syncUnsafe = true;

		await expect(
			syncItemV5({
				ctx: {
					org: { id: "org_1" },
					redisV2: sharedRedis,
					logger: { debug: () => {} },
				} as never,
				payload: {
					customerId: "customer_1",
					orgId: "org_1",
					env: AppEnv.Sandbox,
					timestamp: 0,
				},
			}),
		).rejects.toThrow("unsafe");
		expect(clearSyncClaimMock).not.toHaveBeenCalled();
	});
});
