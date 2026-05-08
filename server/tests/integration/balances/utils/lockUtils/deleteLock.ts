import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { redis } from "@/external/redis/initRedis.js";
import { getRedisV2OrgCleanupCandidates } from "@/external/redis/orgRedisUtils/orgRedisMigrationUtils.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import { buildClaimMarkerKey } from "@/internal/balances/utils/lockV2/buildClaimMarkerKey.js";

export const deleteLock = async ({
	ctx,
	lockId,
}: {
	ctx: TestContext;
	lockId: string;
}) => {
	const hashedKey = Bun.hash(lockId).toString();
	const redisReceiptKey = buildLockReceiptKey({
		orgId: ctx.org.id,
		env: ctx.env,
		lockKey: hashedKey,
	});
	const claimMarkerKey = buildClaimMarkerKey(redisReceiptKey);

	await Promise.all([
		redis.del(redisReceiptKey),
		...getRedisV2OrgCleanupCandidates({ ctx }).map((redisInstance) =>
			redisInstance.del(redisReceiptKey, claimMarkerKey),
		),
	]);
};
