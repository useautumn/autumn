/**
 * Regression test for coalesced balance syncs on org-dedicated Redis.
 *
 * Red-failure mode (current behavior):
 *  - an `org` sync target falls back to the worker's shared Redis client, so
 *    the dirty state written to dedicated Redis is never claimed.
 *
 * Green-success criteria (after fix):
 *  - the worker resolves an `org` sync target to the org-dedicated Redis client.
 */

import { expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { Redis } from "ioredis";

const sharedRedis = { name: "shared" } as unknown as Redis;
const dedicatedRedis = { name: "dedicated" } as unknown as Redis;
const claimedRedisInstances: Redis[] = [];

mock.module("@/external/redis/orgRedisPool.js", () => ({
	getOrgRedis: () => dedicatedRedis,
}));

mock.module("@/external/redis/resolveRedisV2.js", () => ({
	getRedisV2ByInstanceName: () => null,
}));

mock.module(
	"@/internal/balances/utils/sync/dirtyState/claimSyncDirty.js",
	() => ({
		claimSyncDirty: ({ redis }: { redis: Redis }) => {
			claimedRedisInstances.push(redis);
			return null;
		},
		clearSyncClaim: () => undefined,
	}),
);

mock.module("@/internal/balances/utils/sync/syncItemV4.js", () => ({
	syncItemV4: () => undefined,
}));

import { syncItemV5 } from "@/internal/balances/utils/sync/syncItemV5.js";

test("syncItemV5 claims org-targeted dirty state from dedicated Redis", async () => {
	claimedRedisInstances.length = 0;

	await syncItemV5({
		ctx: {
			org: {
				id: "org_dedicated",
				redis_config: {
					connectionString: "encrypted",
					url: "dragonfly.internal:6379",
					migrationPercent: 100,
					previousMigrationPercent: 0,
					migrationChangedAt: 1,
				},
			},
			redisV2: sharedRedis,
			logger: { debug: () => undefined },
		} as never,
		payload: {
			customerId: "customer_dedicated",
			orgId: "org_dedicated",
			env: AppEnv.Sandbox,
			redisInstance: "org",
			timestamp: 0,
		},
	});

	expect(claimedRedisInstances).toEqual([dedicatedRedis]);
});
