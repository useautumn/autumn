/**
 * Regression coverage for the producer side of dedicated Redis coalescing.
 *
 * Before the fix, the batching manager overwrote the actual deduction target
 * with a global Redis target name. The queued signal must preserve the target
 * of the Redis instance where its dirty state was written.
 */

import { expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { Redis } from "ioredis";

const queuedJobs: Array<{ payload: { redisInstance?: string } }> = [];
const dirtyRedisInstances: Redis[] = [];

mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: { error: () => undefined },
}));

mock.module("@/external/redis/initRedis.js", () => ({
	currentRegion: "us-west-2",
}));

mock.module("@/queue/queueUtils.js", () => ({
	addTaskToQueue: async (job: { payload: { redisInstance?: string } }) => {
		queuedJobs.push(job);
	},
}));

mock.module(
	"@/internal/balances/utils/sync/dirtyState/markSyncDirty.js",
	() => ({
		markSyncDirty: ({ redis }: { redis: Redis }) => {
			dirtyRedisInstances.push(redis);
			return { shouldSignal: true };
		},
	}),
);

import { SyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";

test("coalesced sync signal preserves its org Redis target", async () => {
	queuedJobs.length = 0;
	dirtyRedisInstances.length = 0;
	const dedicatedRedis = { name: "dedicated" } as unknown as Redis;
	const manager = new SyncBatchingManagerV3({ batchWindowMs: 60_000 });

	manager.addSyncItem({
		customerId: "customer_dedicated",
		orgId: "org_dedicated",
		env: AppEnv.Sandbox,
		cusEntIds: ["entitlement_1"],
		modifiedCusEntIdsByFeatureId: {
			emails: ["entitlement_1"],
		},
		coalesce: true,
		coalesceRedis: dedicatedRedis,
		redisInstance: "org",
	});

	await manager.flush();

	expect(dirtyRedisInstances).toEqual([dedicatedRedis]);
	expect(queuedJobs).toHaveLength(1);
	expect(queuedJobs[0]?.payload.redisInstance).toBe("org");
});
