import { expect } from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { redis } from "@/external/redis/initRedis.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";

/** Asserts that the lock receipt for the given key no longer exists in Redis. */
export const expectLockReceiptDeleted = async ({
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

	const receipt = await redis.call("JSON.GET", redisReceiptKey, "$");
	expect(receipt).toBeNull();
};
