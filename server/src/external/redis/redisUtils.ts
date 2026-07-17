import { randomUUID } from "node:crypto";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { Redis } from "ioredis";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { hasRedisConfig, redis } from "./initRedis.js";

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`;

const RENEW_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

interface LockData {
	errorMessage: string;
	ownerToken: string;
}

type LockRuntime = {
	redisConfigured?: boolean;
	redisInstance?: Redis;
};

export type OwnedLockContext = {
	assertLockOwned: () => void;
};

type LockAcquisition =
	| { status: "acquired"; leaseExpiresAtMs: number; lockValue: string }
	| { status: "contended" }
	| { status: "disabled" }
	| { status: "unavailable"; error: unknown };

const DEFAULT_ERROR_MESSAGE =
	"Operation already in progress, try again in a few seconds";
const LOCK_RETRY_MIN_DELAY_MS = 75;
const LOCK_RETRY_JITTER_MS = 50;
const LOCK_RELEASE_MAX_WAIT_MS = 500;
const LOCK_RELEASE_ATTEMPT_TIMEOUT_MS = 100;
const LOCK_RELEASE_RETRY_DELAY_MS = 25;

class RedisLockOperationTimeoutError extends Error {
	constructor() {
		super("Redis lock operation timed out");
		this.name = "RedisLockOperationTimeoutError";
	}
}

const resolveRedisConfigured = ({
	redisConfigured,
	redisInstance,
}: {
	redisConfigured: boolean | undefined;
	redisInstance: Redis;
}) => redisConfigured ?? (redisInstance === redis ? hasRedisConfig : true);

const waitForDelay = ({ delayMs }: { delayMs: number }) =>
	new Promise<void>((resolve) => setTimeout(resolve, delayMs));

const waitForLockRetry = ({
	maxDelayMs,
	minimumDelayMs = LOCK_RETRY_MIN_DELAY_MS,
}: {
	maxDelayMs: number;
	minimumDelayMs?: number;
}) => {
	const jitterMs = Math.floor(Math.random() * LOCK_RETRY_JITTER_MS);
	return waitForDelay({
		delayMs: Math.max(0, Math.min(minimumDelayMs + jitterMs, maxDelayMs)),
	});
};

const waitForLeaseRenewal = ({
	delayMs,
	signal,
}: {
	delayMs: number;
	signal: AbortSignal;
}): Promise<boolean> => {
	if (signal.aborted) return Promise.resolve(false);

	return new Promise((resolve) => {
		const onAbort = () => {
			clearTimeout(timeoutId);
			resolve(false);
		};
		const timeoutId = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve(true);
		}, delayMs);
		signal.addEventListener("abort", onAbort, { once: true });
	});
};

const runWithTimeout = async <T>({
	operation,
	timeoutMs,
}: {
	operation: () => Promise<T>;
	timeoutMs: number;
}): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation(),
			new Promise<never>((_resolve, reject) => {
				timeoutId = setTimeout(
					() => reject(new RedisLockOperationTimeoutError()),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
};

const createRedisNotReadyError = ({ source }: { source: string }) =>
	new RedisUnavailableError({ source, reason: "not_ready" });

const createLockOwnershipLostError = () =>
	new RecaseError({
		message: "Lost ownership of operation lock while work was still running",
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});

const createLockWaitTimeoutError = ({ maxWaitMs }: { maxWaitMs: number }) =>
	new RecaseError({
		message: `Timed out after ${maxWaitMs}ms waiting for operation lock`,
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});

const releaseOwnedLock = async ({
	lockKey,
	lockValue,
	redisConfigured,
	redisInstance,
	retryWhenNotOwned = false,
}: {
	lockKey: string;
	lockValue: string | null;
	redisConfigured: boolean;
	redisInstance: Redis;
	retryWhenNotOwned?: boolean;
}): Promise<boolean> => {
	if (!lockValue || !redisConfigured) return false;

	const deadlineMs = Date.now() + LOCK_RELEASE_MAX_WAIT_MS;
	do {
		if (redisInstance.status === "ready") {
			try {
				const remainingMs = Math.max(1, deadlineMs - Date.now());
				const result = await runRedisOp({
					operation: () =>
						runWithTimeout({
							operation: () =>
								redisInstance.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue),
							timeoutMs: Math.min(LOCK_RELEASE_ATTEMPT_TIMEOUT_MS, remainingMs),
						}),
					source: "clearLock",
					redisInstance,
				});
				if (result === 1) return true;
				if (!retryWhenNotOwned) return false;
			} catch {
				// Retry until the short release budget is exhausted. The owner token
				// makes duplicate or delayed release attempts safe.
			}
		}

		const remainingMs = deadlineMs - Date.now();
		if (remainingMs <= 0) return false;
		await waitForDelay({
			delayMs: Math.min(LOCK_RELEASE_RETRY_DELAY_MS, remainingMs),
		});
	} while (Date.now() < deadlineMs);

	return false;
};

export const clearLock = async ({
	lockKey,
	lockValue,
	redisConfigured,
	redisInstance = redis,
}: {
	lockKey: string;
	lockValue: string | null;
} & LockRuntime): Promise<boolean> =>
	releaseOwnedLock({
		lockKey,
		lockValue,
		redisConfigured: resolveRedisConfigured({
			redisConfigured,
			redisInstance,
		}),
		redisInstance,
	});

const tryAcquireLock = async ({
	lockKey,
	ttlMs,
	errorMessage,
	deadlineMs,
	redisConfigured,
	redisInstance,
}: {
	lockKey: string;
	ttlMs: number;
	errorMessage: string;
	deadlineMs?: number;
	redisConfigured: boolean;
	redisInstance: Redis;
}): Promise<LockAcquisition> => {
	if (!redisConfigured) return { status: "disabled" };
	if (redisInstance.status !== "ready") {
		return {
			status: "unavailable",
			error: createRedisNotReadyError({ source: "acquireLock" }),
		};
	}

	const lockData: LockData = {
		errorMessage,
		ownerToken: randomUUID(),
	};
	const lockValue = JSON.stringify(lockData);
	const acquisitionStartedAtMs = Date.now();
	if (deadlineMs !== undefined && acquisitionStartedAtMs >= deadlineMs) {
		return {
			status: "unavailable",
			error: new RedisLockOperationTimeoutError(),
		};
	}

	const acquisitionPromise = runRedisOp({
		operation: () =>
			redisInstance.set(lockKey, lockValue, "PX", ttlMs, "NX") as Promise<
				"OK" | null
			>,
		source: "acquireLock",
		redisInstance,
	});

	try {
		const result =
			deadlineMs === undefined
				? await acquisitionPromise
				: await runWithTimeout({
						operation: () => acquisitionPromise,
						timeoutMs: Math.max(1, deadlineMs - acquisitionStartedAtMs),
					});

		if (result === null) return { status: "contended" };
		return {
			status: "acquired",
			lockValue,
			leaseExpiresAtMs: acquisitionStartedAtMs + ttlMs,
		};
	} catch (error) {
		if (error instanceof RedisLockOperationTimeoutError) {
			// Redis commands cannot be cancelled. Keep the owner token and clean up
			// asynchronously if this SET lands after the caller's wait deadline.
			void (async () => {
				try {
					const result = await acquisitionPromise;
					if (result === null) return;
				} catch {
					// A rejected reply is ambiguous: SET may still have landed server-side.
				}

				await releaseOwnedLock({
					lockKey,
					lockValue,
					redisConfigured,
					redisInstance,
					retryWhenNotOwned: true,
				});
			})().catch(() => undefined);

			return { status: "unavailable", error };
		}

		// SET NX may have landed even when its reply was lost. Retain the owner
		// token and make bounded, owner-safe cleanup attempts before returning.
		await releaseOwnedLock({
			lockKey,
			lockValue,
			redisConfigured,
			redisInstance,
			retryWhenNotOwned: true,
		});
		return { status: "unavailable", error };
	}
};

const parseLockErrorMessage = ({
	existingValue,
	fallback,
}: {
	existingValue: string | null;
	fallback: string;
}) => {
	if (!existingValue) return fallback;
	try {
		const parsed = JSON.parse(existingValue) as Partial<LockData>;
		return typeof parsed.errorMessage === "string"
			? parsed.errorMessage
			: fallback;
	} catch {
		return fallback;
	}
};

const getContendedLockErrorMessage = async ({
	lockKey,
	fallback,
	redisInstance,
}: {
	lockKey: string;
	fallback: string;
	redisInstance: Redis;
}) => {
	if (redisInstance.status !== "ready") return fallback;
	try {
		return parseLockErrorMessage({
			existingValue: await redisInstance.get(lockKey),
			fallback,
		});
	} catch {
		// SET NX already proved contention. A best-effort message lookup must
		// never turn that definite result into a fail-open acquisition.
		return fallback;
	}
};

const throwLockContention = async ({
	lockKey,
	errorMessage,
	redisInstance,
}: {
	lockKey: string;
	errorMessage: string;
	redisInstance: Redis;
}): Promise<never> => {
	throw new RecaseError({
		message: await getContendedLockErrorMessage({
			lockKey,
			fallback: errorMessage,
			redisInstance,
		}),
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});
};

/**
 * Acquire a distributed lock using Redis.
 * If Redis is intentionally unconfigured, or unavailable with failOpen=true,
 * returns null. Configured correctness-critical callers pass failOpen=false.
 */
export const acquireLock = async ({
	lockKey,
	ttlMs = 10000,
	errorMessage = DEFAULT_ERROR_MESSAGE,
	failOpen = true,
	redisConfigured,
	redisInstance = redis,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
	failOpen?: boolean;
} & LockRuntime): Promise<string | null> => {
	const acquisition = await tryAcquireLock({
		lockKey,
		ttlMs,
		errorMessage,
		redisConfigured: resolveRedisConfigured({
			redisConfigured,
			redisInstance,
		}),
		redisInstance,
	});

	switch (acquisition.status) {
		case "acquired":
			return acquisition.lockValue;
		case "contended":
			return throwLockContention({ lockKey, errorMessage, redisInstance });
		case "disabled":
			return null;
		case "unavailable":
			if (failOpen) return null;
			throw acquisition.error;
	}
};

const renewLock = async ({
	lockKey,
	lockValue,
	ttlMs,
	redisInstance,
}: {
	lockKey: string;
	lockValue: string;
	ttlMs: number;
	redisInstance: Redis;
}): Promise<{ leaseExpiresAtMs: number; renewed: boolean }> => {
	if (redisInstance.status !== "ready") {
		throw createRedisNotReadyError({ source: "renewLock" });
	}

	const renewalStartedAtMs = Date.now();
	const result = await runRedisOp({
		operation: () =>
			redisInstance.eval(RENEW_LOCK_SCRIPT, 1, lockKey, lockValue, ttlMs),
		source: "renewLock",
		redisInstance,
	});
	return {
		renewed: result === 1,
		leaseExpiresAtMs: renewalStartedAtMs + ttlMs,
	};
};

const runWithOwnedLock = async <T>({
	lockKey,
	lockValue,
	ttlMs,
	leaseExpiresAtMs: initialLeaseExpiresAtMs,
	fn,
	redisConfigured,
	redisInstance,
}: {
	lockKey: string;
	lockValue: string | null;
	ttlMs: number;
	leaseExpiresAtMs?: number;
	fn: (context: OwnedLockContext) => Promise<T>;
	redisConfigured: boolean;
	redisInstance: Redis;
}): Promise<T> => {
	if (!lockValue) {
		return fn({ assertLockOwned: () => undefined });
	}

	const renewalController = new AbortController();
	let leaseExpiresAtMs = initialLeaseExpiresAtMs ?? Date.now() + ttlMs;
	let ownershipError: unknown;
	const loseOwnership = () => {
		ownershipError ??= createLockOwnershipLostError();
		renewalController.abort();
	};
	const assertLockOwned = () => {
		if (!ownershipError && Date.now() >= leaseExpiresAtMs) loseOwnership();
		if (ownershipError) throw ownershipError;
	};
	const renewalPromise = (async () => {
		const renewalIntervalMs = Math.max(1, Math.floor(ttlMs / 3));
		const renewalRetryDelayMs = Math.max(
			1,
			Math.min(100, Math.floor(ttlMs / 10)),
		);

		while (
			await waitForLeaseRenewal({
				delayMs: renewalIntervalMs,
				signal: renewalController.signal,
			})
		) {
			while (!renewalController.signal.aborted) {
				if (Date.now() >= leaseExpiresAtMs) {
					loseOwnership();
					break;
				}

				try {
					const renewal = await renewLock({
						lockKey,
						lockValue,
						ttlMs,
						redisInstance,
					});
					if (!renewal.renewed) {
						loseOwnership();
						break;
					}
					leaseExpiresAtMs = renewal.leaseExpiresAtMs;
					break;
				} catch {
					const remainingLeaseMs = leaseExpiresAtMs - Date.now();
					if (remainingLeaseMs <= 0) {
						loseOwnership();
						break;
					}
					const shouldRetry = await waitForLeaseRenewal({
						delayMs: Math.min(renewalRetryDelayMs, remainingLeaseMs),
						signal: renewalController.signal,
					});
					if (!shouldRetry) break;
				}
			}
		}
	})();

	try {
		// The callback owns its safe-point checks. An implicit check after it
		// returns could turn already-committed billing work into a retryable 423.
		return await fn({ assertLockOwned });
	} finally {
		renewalController.abort();
		await renewalPromise;
		await releaseOwnedLock({
			lockKey,
			lockValue,
			redisConfigured,
			redisInstance,
		});
	}
};

/**
 * Execute a function with a distributed lock. Configured Redis failures are
 * fail-open by default for backward compatibility; failOpen=false is intended
 * for correctness-critical callers.
 */
export const withLock = async <T>({
	lockKey,
	ttlMs = 10000,
	errorMessage = DEFAULT_ERROR_MESSAGE,
	failOpen = true,
	fn,
	redisConfigured,
	redisInstance = redis,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
	failOpen?: boolean;
	fn: (context: OwnedLockContext) => Promise<T>;
} & LockRuntime): Promise<T> => {
	const resolvedRedisConfigured = resolveRedisConfigured({
		redisConfigured,
		redisInstance,
	});
	const acquisition = await tryAcquireLock({
		lockKey,
		ttlMs,
		errorMessage,
		redisConfigured: resolvedRedisConfigured,
		redisInstance,
	});

	if (acquisition.status === "contended") {
		return throwLockContention({ lockKey, errorMessage, redisInstance });
	}
	if (acquisition.status === "unavailable") {
		if (!failOpen) throw acquisition.error;
		return fn({ assertLockOwned: () => undefined });
	}
	if (acquisition.status === "disabled") {
		return fn({ assertLockOwned: () => undefined });
	}

	return runWithOwnedLock({
		lockKey,
		lockValue: acquisition.lockValue,
		ttlMs,
		leaseExpiresAtMs: acquisition.leaseExpiresAtMs,
		fn,
		redisConfigured: resolvedRedisConfigured,
		redisInstance,
	});
};

/**
 * Execute a function after waiting for exclusive ownership of a lock.
 * Configured Redis failures are retried within maxWaitMs; intentionally
 * unconfigured deployments retain their Postgres-only behavior.
 */
export const withWaitingLock = async <T>({
	lockKey,
	ttlMs,
	maxWaitMs,
	errorMessage = DEFAULT_ERROR_MESSAGE,
	fn,
	redisConfigured,
	redisInstance = redis,
}: {
	lockKey: string;
	ttlMs: number;
	maxWaitMs: number;
	errorMessage?: string;
	fn: (context: OwnedLockContext) => Promise<T>;
} & LockRuntime): Promise<T> => {
	const resolvedRedisConfigured = resolveRedisConfigured({
		redisConfigured,
		redisInstance,
	});
	if (!resolvedRedisConfigured) {
		return fn({ assertLockOwned: () => undefined });
	}

	const deadlineMs = Date.now() + maxWaitMs;
	let sawContention = false;
	let lastUnavailableError: unknown;
	let unavailableAttemptCount = 0;

	const throwWaitFailure = (): never => {
		if (!sawContention && lastUnavailableError) {
			throw lastUnavailableError;
		}
		throw createLockWaitTimeoutError({ maxWaitMs });
	};

	while (true) {
		const acquisition = await tryAcquireLock({
			lockKey,
			ttlMs,
			errorMessage,
			deadlineMs,
			redisConfigured: resolvedRedisConfigured,
			redisInstance,
		});

		if (
			acquisition.status === "unavailable" &&
			acquisition.error instanceof RedisLockOperationTimeoutError
		) {
			throw createLockWaitTimeoutError({ maxWaitMs });
		}

		if (acquisition.status === "acquired") {
			if (Date.now() >= deadlineMs) {
				void releaseOwnedLock({
					lockKey,
					lockValue: acquisition.lockValue,
					redisConfigured: resolvedRedisConfigured,
					redisInstance,
				}).catch(() => undefined);
				throw createLockWaitTimeoutError({ maxWaitMs });
			}
			return runWithOwnedLock({
				lockKey,
				lockValue: acquisition.lockValue,
				ttlMs,
				leaseExpiresAtMs: acquisition.leaseExpiresAtMs,
				fn,
				redisConfigured: resolvedRedisConfigured,
				redisInstance,
			});
		}

		if (acquisition.status === "disabled") {
			return fn({ assertLockOwned: () => undefined });
		}
		if (acquisition.status === "contended") {
			sawContention = true;
			unavailableAttemptCount = 0;
		} else {
			lastUnavailableError = acquisition.error;
			unavailableAttemptCount++;
		}

		const remainingMs = deadlineMs - Date.now();
		if (remainingMs <= 0) throwWaitFailure();

		const unavailableBackoffMs =
			acquisition.status === "unavailable"
				? Math.min(1_000, 100 * 2 ** Math.min(unavailableAttemptCount - 1, 4))
				: LOCK_RETRY_MIN_DELAY_MS;
		await waitForLockRetry({
			maxDelayMs: remainingMs,
			minimumDelayMs: unavailableBackoffMs,
		});
		if (Date.now() >= deadlineMs) throwWaitFailure();
	}
};
