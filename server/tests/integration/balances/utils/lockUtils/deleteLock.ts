import { balanceLocks } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq } from "drizzle-orm";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { getRedisV2OrgCleanupCandidates } from "@/external/redis/orgRedisUtils/orgRedisMigrationUtils.js";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
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

	// The balance worker keeps the lock as a row; its owner is evicted so the worker forgets the id too.
	const deletedLocks = await ctx.db
		.delete(balanceLocks)
		.where(
			and(
				eq(balanceLocks.org_id, ctx.org.id),
				eq(balanceLocks.env, ctx.env),
				eq(balanceLocks.lock_id, lockId),
			),
		)
		.returning({ customerId: balanceLocks.customer_id });
	for (const { customerId } of deletedLocks)
		await evictBalanceWorkerCustomer({ ctx, customerId });

	await Promise.all([
		getMiscRedis().del(redisReceiptKey),
		...getRedisV2OrgCleanupCandidates({ ctx }).map((redisInstance) =>
			redisInstance.del(redisReceiptKey, claimMarkerKey),
		),
	]);
};
