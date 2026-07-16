import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { redis, waitForRedisReady } from "@/external/redis/initRedis.js";
import { acquireLock, clearLock } from "@/external/redis/redisUtils.js";

test("a stale lock owner cannot release a replacement lock", async () => {
	await waitForRedisReady(redis, "primary");

	const lockKey = `test:redis-lock-ownership:${randomUUID()}`;
	try {
		const staleLockValue = await acquireLock({
			lockKey,
			ttlMs: 5_000,
			failOpen: false,
		});
		expect(staleLockValue).not.toBeNull();

		// Simulate the first owner's TTL expiring before its finally block runs.
		await redis.del(lockKey);
		const replacementLockValue = await acquireLock({
			lockKey,
			ttlMs: 5_000,
			failOpen: false,
		});
		expect(replacementLockValue).not.toBeNull();

		expect(await clearLock({ lockKey, lockValue: staleLockValue })).toBeFalse();
		expect(await redis.get(lockKey)).toBe(replacementLockValue);
		expect(
			await clearLock({ lockKey, lockValue: replacementLockValue }),
		).toBeTrue();
		expect(await redis.get(lockKey)).toBeNull();
	} finally {
		await redis.del(lockKey);
	}
});
