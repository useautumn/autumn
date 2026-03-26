import { expect } from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";

/** Asserts that the lock receipt for the given ID no longer exists in Redis. */
export const expectLockReceiptDeleted = async ({
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

	const receipt = await ctx.redis.call("JSON.GET", redisReceiptKey, "$");
	expect(receipt).toBeNull();
};
