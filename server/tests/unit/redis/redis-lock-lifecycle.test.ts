import { describe, expect, test } from "bun:test";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import {
	acquireLock,
	clearLock,
	withLock,
	withWaitingLock,
} from "@/external/redis/redisUtils.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";

const timeout = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

class FakeRedisLockClient {
	status: "ready" | "end" = "ready";
	value: string | null = null;
	getCalls = 0;
	releaseCalls = 0;
	renewalCalls = 0;
	setCalls = 0;
	releaseFailuresRemaining = 0;
	renewalFailuresRemaining = 0;
	setImplementation?: (lockValue: string) => Promise<"OK" | null>;

	async set(_lockKey: string, lockValue: string) {
		this.setCalls++;
		if (this.setImplementation) return this.setImplementation(lockValue);
		if (this.value !== null) return null;
		this.value = lockValue;
		return "OK" as const;
	}

	async get() {
		this.getCalls++;
		return this.value;
	}

	async eval(
		script: string,
		_keyCount: number,
		_lockKey: string,
		lockValue: string,
	) {
		if (script.includes("PEXPIRE")) {
			this.renewalCalls++;
			if (this.renewalFailuresRemaining > 0) {
				this.renewalFailuresRemaining--;
				throw new Error("Command timed out");
			}
			return this.value === lockValue ? 1 : 0;
		}

		this.releaseCalls++;
		if (this.releaseFailuresRemaining > 0) {
			this.releaseFailuresRemaining--;
			throw new Error("Command timed out");
		}
		if (this.value !== lockValue) return 0;
		this.value = null;
		return 1;
	}
}

const asRedis = (redisClient: FakeRedisLockClient) =>
	redisClient as unknown as Redis;

describe("Redis lock lifecycle", () => {
	test("runs without touching Redis when Redis is intentionally unconfigured", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.status = "end";

		await expect(
			withWaitingLock({
				lockKey: "lock:no-redis",
				ttlMs: 100,
				maxWaitMs: 25,
				redisConfigured: false,
				redisInstance: asRedis(redisClient),
				fn: async () => "completed",
			}),
		).resolves.toBe("completed");
		expect(redisClient.setCalls).toBe(0);
	});

	test("fails closed when configured Redis is unavailable", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.status = "end";

		await expect(
			withLock({
				lockKey: "lock:configured-unavailable",
				ttlMs: 100,
				failOpen: false,
				redisConfigured: true,
				redisInstance: asRedis(redisClient),
				fn: async () => "must-not-run",
			}),
		).rejects.toBeInstanceOf(RedisUnavailableError);
		expect(redisClient.setCalls).toBe(0);
	});

	test("retries a transient acquisition failure within the waiting budget", async () => {
		const redisClient = new FakeRedisLockClient();
		let acquisitionAttempts = 0;
		redisClient.setImplementation = async (lockValue) => {
			acquisitionAttempts++;
			if (acquisitionAttempts === 1) throw new Error("Command timed out");
			redisClient.value = lockValue;
			return "OK";
		};

		await expect(
			withWaitingLock({
				lockKey: "lock:acquisition-retry",
				ttlMs: 1_000,
				maxWaitMs: 1_500,
				redisInstance: asRedis(redisClient),
				fn: async () => "completed",
			}),
		).resolves.toBe("completed");
		expect(acquisitionAttempts).toBe(2);
	});

	test("retries a transient renewal error while the known lease is still valid", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.renewalFailuresRemaining = 1;

		await expect(
			withWaitingLock({
				lockKey: "lock:renewal-retry",
				ttlMs: 300,
				maxWaitMs: 100,
				redisInstance: asRedis(redisClient),
				fn: async ({ assertLockOwned }) => {
					await timeout(450);
					assertLockOwned();
					return "completed";
				},
			}),
		).resolves.toBe("completed");
		expect(redisClient.renewalCalls).toBeGreaterThanOrEqual(2);
	});

	test("retries an owner-safe release after a transient Redis error", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.value = "owner-value";
		redisClient.releaseFailuresRemaining = 1;

		await expect(
			clearLock({
				lockKey: "lock:release-retry",
				lockValue: "owner-value",
				redisInstance: asRedis(redisClient),
			}),
		).resolves.toBeTrue();
		expect(redisClient.releaseCalls).toBe(2);
		expect(redisClient.value).toBeNull();
	});

	test("retries release while the Redis client reconnects", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.status = "end";
		redisClient.value = "owner-value";
		setTimeout(() => {
			redisClient.status = "ready";
		}, 50);

		await expect(
			clearLock({
				lockKey: "lock:release-reconnect",
				lockValue: "owner-value",
				redisInstance: asRedis(redisClient),
			}),
		).resolves.toBeTrue();
		expect(redisClient.value).toBeNull();
	});

	test("cleans up an ambiguous acquisition when SET lands but its reply is lost", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.setImplementation = async (lockValue) => {
			redisClient.value = lockValue;
			throw new Error("Command timed out");
		};

		await expect(
			acquireLock({
				lockKey: "lock:ambiguous-acquire",
				ttlMs: 1_000,
				failOpen: false,
				redisInstance: asRedis(redisClient),
			}),
		).rejects.toThrow();
		expect(redisClient.value).toBeNull();
		expect(redisClient.releaseCalls).toBeGreaterThan(0);
	});

	test("reports contention even when the existing lock value is malformed", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.value = "not-json";

		const error = await acquireLock({
			lockKey: "lock:malformed-value",
			ttlMs: 1_000,
			failOpen: false,
			redisInstance: asRedis(redisClient),
		}).catch((caughtError: unknown) => caughtError);

		expect(error).toBeInstanceOf(RecaseError);
		expect(error).toMatchObject({ code: ErrCode.LockAlreadyExists });
	});

	test("does not GET the existing lock on each waiting acquisition attempt", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.value = JSON.stringify({
			errorMessage: "already running",
			ownerToken: "another-owner",
		});

		await expect(
			withWaitingLock({
				lockKey: "lock:wait-without-get",
				ttlMs: 1_000,
				maxWaitMs: 25,
				redisInstance: asRedis(redisClient),
				fn: async () => undefined,
			}),
		).rejects.toMatchObject({ code: ErrCode.LockAlreadyExists });
		expect(redisClient.getCalls).toBe(0);
	});

	test("releases a lease acquired after the waiting deadline without running work", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.setImplementation = async (lockValue) => {
			await timeout(30);
			redisClient.value = lockValue;
			return "OK";
		};
		let callbackRan = false;

		await expect(
			withWaitingLock({
				lockKey: "lock:late-acquisition",
				ttlMs: 1_000,
				maxWaitMs: 5,
				redisInstance: asRedis(redisClient),
				fn: async () => {
					callbackRan = true;
				},
			}),
		).rejects.toMatchObject({ code: ErrCode.LockAlreadyExists });
		expect(callbackRan).toBeFalse();
		expect(redisClient.value).toBeNull();
	});

	test("bounds a stalled acquisition by the waiting deadline and cleans up a late lease", async () => {
		const redisClient = new FakeRedisLockClient();
		redisClient.setImplementation = async (lockValue) => {
			await timeout(200);
			redisClient.value = lockValue;
			return "OK";
		};
		let callbackRan = false;
		const startedAtMs = Date.now();

		await expect(
			withWaitingLock({
				lockKey: "lock:stalled-acquisition",
				ttlMs: 1_000,
				maxWaitMs: 25,
				redisInstance: asRedis(redisClient),
				fn: async () => {
					callbackRan = true;
				},
			}),
		).rejects.toMatchObject({ code: ErrCode.LockAlreadyExists });

		expect(Date.now() - startedAtMs).toBeLessThan(125);
		expect(callbackRan).toBeFalse();

		await timeout(250);
		expect(redisClient.value).toBeNull();
	});

	test("does not report ownership loss after the callback has committed", async () => {
		const redisClient = new FakeRedisLockClient();
		let committed = false;

		await expect(
			withLock({
				lockKey: "lock:post-commit-ownership-loss",
				ttlMs: 90,
				redisInstance: asRedis(redisClient),
				fn: async () => {
					redisClient.value = "replacement-owner";
					await timeout(50);
					expect(redisClient.renewalCalls).toBeGreaterThan(0);
					committed = true;
					return "committed";
				},
			}),
		).resolves.toBe("committed");

		expect(committed).toBeTrue();
		expect(redisClient.value).toBe("replacement-owner");
	});

	test("renews ordinary route-style locks while their callback is running", async () => {
		const redisClient = new FakeRedisLockClient();

		await withLock({
			lockKey: "lock:route-renewal",
			ttlMs: 90,
			redisInstance: asRedis(redisClient),
			fn: async () => timeout(180),
		});

		expect(redisClient.renewalCalls).toBeGreaterThan(0);
	});
});
