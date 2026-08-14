import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const dedicatedRedis = {};
const sharedRedis = {};
let claimedRedis: unknown;

await mockModuleWithRestore("@/external/redis/orgRedisPool.js", () => ({
	getOrgRedis: () => dedicatedRedis,
}));

await mockModuleWithRestore(
	"@/internal/balances/utils/sync/dirtyState/claimSyncDirty.js",
	() => ({
		claimSyncDirty: ({ redis }: { redis: unknown }) => {
			claimedRedis = redis;
			return null;
		},
		clearSyncClaim: () => {},
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/utils/sync/syncItemV4.js",
	() => ({
		syncItemV4: () => {},
	}),
);

const { syncItemV5 } = await import(
	"@/internal/balances/utils/sync/syncItemV5.js"
);

describe("syncItemV5 Redis routing", () => {
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
	});
});
