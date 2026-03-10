import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { redis } from "@/external/redis/initRedis.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";

export const deleteLock = async ({
	ctx,
	lockKey,
}: {
	ctx: TestContext;
	lockKey: string;
}) => {
	const hashedKey = Bun.hash(lockKey).toString();
	const redisReceiptKey = buildLockReceiptKey({
		orgId: ctx.org.id,
		env: ctx.env,
		lockKey: hashedKey,
	});

	await redis.del(redisReceiptKey);
};
