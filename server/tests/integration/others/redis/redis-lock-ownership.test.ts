import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { ErrCode } from "@autumn/shared";
import { redis, waitForRedisReady } from "@/external/redis/initRedis.js";
import {
	acquireLock,
	clearLock,
	withWaitingLock,
} from "@/external/redis/redisUtils.js";

const createDeferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((resolver) => {
		resolve = resolver;
	});

	return { promise, resolve };
};

const timeout = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const describeRedis = process.env.TESTS_ORG ? describe : describe.skip;

describeRedis("Redis lock ownership", () => {
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

			expect(
				await clearLock({ lockKey, lockValue: staleLockValue }),
			).toBeFalse();
			expect(await redis.get(lockKey)).toBe(replacementLockValue);
			expect(
				await clearLock({ lockKey, lockValue: replacementLockValue }),
			).toBeTrue();
			expect(await redis.get(lockKey)).toBeNull();
		} finally {
			await redis.del(lockKey);
		}
	});

	test("a waiting lock renews ownership while its callback is still running", async () => {
		await waitForRedisReady(redis, "primary");

		const lockKey = `test:redis-lock-renewal:${randomUUID()}`;
		const firstEntered = createDeferred();
		const releaseFirst = createDeferred();
		let firstIsRunning = false;
		let callbacksOverlapped = false;

		const firstOptions = {
			lockKey,
			ttlMs: 1_000,
			maxWaitMs: 3_000,
			fn: async () => {
				firstIsRunning = true;
				firstEntered.resolve();
				await releaseFirst.promise;
				firstIsRunning = false;
			},
		};
		const first = withWaitingLock(firstOptions);
		await firstEntered.promise;

		const secondOptions = {
			lockKey,
			ttlMs: 1_000,
			maxWaitMs: 3_000,
			fn: async () => {
				callbacksOverlapped = firstIsRunning;
			},
		};
		const second = withWaitingLock(secondOptions);

		try {
			// The second callback must still be waiting after the original 1s
			// lease would have expired without renewal.
			await timeout(1_500);
			expect(callbacksOverlapped).toBeFalse();
		} finally {
			releaseFirst.resolve();
			await Promise.allSettled([first, second]);
			await redis.del(lockKey);
		}
	});

	test("a waiting lock fails after its acquisition deadline", async () => {
		await waitForRedisReady(redis, "primary");

		const lockKey = `test:redis-lock-wait-timeout:${randomUUID()}`;
		const lockValue = await acquireLock({
			lockKey,
			ttlMs: 500,
			failOpen: false,
		});
		const startedAt = Date.now();
		const waitingOptions = {
			lockKey,
			ttlMs: 500,
			maxWaitMs: 75,
			fn: async () => undefined,
		};

		try {
			await expect(withWaitingLock(waitingOptions)).rejects.toMatchObject({
				code: ErrCode.LockAlreadyExists,
			});
			expect(Date.now() - startedAt).toBeLessThan(400);
		} finally {
			await clearLock({ lockKey, lockValue });
			await redis.del(lockKey);
		}
	});

	test("a waiting lock stops at a safe point after losing ownership", async () => {
		await waitForRedisReady(redis, "primary");

		const lockKey = `test:redis-lock-renewal-loss:${randomUUID()}`;
		let replacementLockValue: string | null = null;

		try {
			await expect(
				withWaitingLock({
					lockKey,
					ttlMs: 300,
					maxWaitMs: 1_000,
					fn: async ({ assertLockOwned }) => {
						// Replace the lease with another owner. The next renewal must
						// detect that this callback no longer owns the critical section.
						await redis.del(lockKey);
						replacementLockValue = await acquireLock({
							lockKey,
							ttlMs: 5_000,
							failOpen: false,
						});
						await timeout(150);
						assertLockOwned();
					},
				}),
			).rejects.toMatchObject({ code: ErrCode.LockAlreadyExists });
			expect(await redis.get(lockKey)).toBe(replacementLockValue);
		} finally {
			await clearLock({ lockKey, lockValue: replacementLockValue });
			await redis.del(lockKey);
		}
	});
});
