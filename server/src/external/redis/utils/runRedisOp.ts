import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { acquireRedisReadLane } from "../initUtils/createRedisReadPool.js";
import { getStandbyRedisRouter } from "../initUtils/createStandbyRedisRouter.js";
import { RedisUnavailableError } from "./errors.js";
import { isConnectionLevelRedisError } from "./isTransientRedisError.js";

const REDIS_WARNING_INTERVAL_MS = 30_000;
/** Below this a retry cannot finish, so spend the budget on the fallback. */
const MIN_RETRY_BUDGET_MS = 50;
const STANDBY_RETRY_RESERVE_RATIO = 0.25;
const MAX_STANDBY_RETRY_RESERVE_MS = 250;
const lastRedisWarningAtBySource = new Map<string, number>();

export const getPreferredAttemptBudgetMs = ({
	timeoutMs,
}: {
	timeoutMs?: number;
}): number | undefined => {
	if (timeoutMs === undefined) return undefined;

	const retryReserveMs = Math.min(
		Math.floor(timeoutMs * STANDBY_RETRY_RESERVE_RATIO),
		MAX_STANDBY_RETRY_RESERVE_MS,
	);
	return retryReserveMs >= MIN_RETRY_BUDGET_MS
		? timeoutMs - retryReserveMs
		: timeoutMs;
};

const classifyErrorReason = (
	targetRedis: Redis,
	error: unknown,
): UnavailableReason | null => {
	if (targetRedis.status !== "ready") return "not_ready";
	const message = error instanceof Error ? error.message : String(error);
	if (/ETIMEDOUT|timeout/i.test(message)) return "timeout";
	if (/ECONN|closed|writeable|max retries/i.test(message)) return "connection";
	return null;
};

const warnRedisUnavailable = ({
	source,
	reason,
	error,
}: {
	source: string;
	reason: UnavailableReason;
	error?: unknown;
}) => {
	const key = `${source}:${reason}`;
	const now = Date.now();
	const lastWarningAt = lastRedisWarningAtBySource.get(key) ?? 0;
	if (now - lastWarningAt < REDIS_WARNING_INTERVAL_MS) return;

	lastRedisWarningAtBySource.set(key, now);
	logger.warn(
		{
			source,
			reason,
			error: error instanceof Error ? error.message : undefined,
		},
		"[redis] operation unavailable",
	);
};

export type UnavailableReason =
	| "not_ready"
	| "timeout"
	| "connection"
	| "other";

/**
 * Runs a Redis operation. Returns the operation's value on success; throws
 * `RedisUnavailableError` on timeout/connection/not-ready failures.
 *
 * Callers that want to fail open catch at the request boundary (see
 * `withRedisFallback`). Callers distinguishing "null value" from "missing"
 * still inspect the return value — this helper does not interpret nullish.
 *
 * When the client is not ready this throws immediately rather than letting
 * the command sit in ioredis's offline queue until `commandTimeout` (10s in
 * prod on the primary client) stalls the request.
 *
 * `queueIfNotReady` opts back into the offline queue: the command waits out a
 * reconnect (bounded by `commandTimeout`) instead of failing instantly. For
 * ops with no fallback — invalidations, where a dropped command means silent
 * cache staleness — riding out a sub-second blip beats dropping the op.
 */
export const runRedisOp = async <T>({
	operation,
	source,
	redisInstance,
	queueIfNotReady = false,
	retryOnStandby = false,
	useReadPool = false,
	timeoutMs,
}: {
	operation: (redis: Redis) => Promise<T>;
	source: string;
	redisInstance: Redis;
	queueIfNotReady?: boolean;
	/** Retry a failed idempotent read once on the other connection. `operation`
	 *  must use its injected `redis`; closing over the router re-runs the same one. */
	retryOnStandby?: boolean;
	/** Select the least-busy read lane. Requires `retryOnStandby` so only
	 *  operations already declared idempotent can enter the pool. */
	useReadPool?: boolean;
	/** Opt-in bound, tighter than the client's `commandTimeout`. Reads only —
	 *  the race abandons the promise but the command still reaches Redis. */
	timeoutMs?: number;
}): Promise<T> => {
	const readLaneLease =
		retryOnStandby && useReadPool
			? acquireRedisReadLane(redisInstance)
			: undefined;
	const targetRedis = readLaneLease?.redis ?? redisInstance;
	const redisAttempts: Promise<T>[] = [];

	try {
		if (!queueIfNotReady && targetRedis.status !== "ready") {
			const reason: UnavailableReason = "not_ready";
			warnRedisUnavailable({ source, reason });
			throw new RedisUnavailableError({ source, reason });
		}

		// One budget for the whole op, not one per attempt: a retry must not double
		// the ceiling the caller sized against its non-Redis fallback.
		const deadlineAt = timeoutMs ? Date.now() + timeoutMs : undefined;
		const runAttempt = (redis: Redis, budgetMs?: number) => {
			const attempt = operation(redis);
			redisAttempts.push(attempt);
			return budgetMs
				? withTimeout({
						timeoutMs: budgetMs,
						fn: () => attempt,
						timeoutMessage: `[redis] ${source} timeout after ${budgetMs}ms`,
					})
				: attempt;
		};

		try {
			const router = retryOnStandby
				? getStandbyRedisRouter(targetRedis)
				: undefined;
			if (!router) return await runAttempt(targetRedis, timeoutMs);

			const [preferred, alternate] = router.ordered();
			// Only shorten the preferred attempt for an alternate worth retrying on.
			// A penalized alternate still beats the non-Redis fallback after failure.
			const preferredAttemptBudgetMs = router.isUsable(alternate)
				? getPreferredAttemptBudgetMs({ timeoutMs })
				: timeoutMs;

			try {
				const value = await runAttempt(preferred, preferredAttemptBudgetMs);
				router.recordOutcome({ connection: preferred });
				return value;
			} catch (firstError) {
				router.recordOutcome({ connection: preferred, error: firstError });

				const remainingMs = deadlineAt ? deadlineAt - Date.now() : undefined;
				const canRetry =
					alternate.status === "ready" &&
					isConnectionLevelRedisError({ error: firstError }) &&
					(remainingMs === undefined || remainingMs >= MIN_RETRY_BUDGET_MS);
				if (!canRetry) throw firstError;

				try {
					const value = await runAttempt(alternate, remainingMs);
					router.recordOutcome({ connection: alternate });
					logger.info(
						{ source, type: "redis_standby_failover" },
						"[redis] standby served a read the preferred connection failed",
					);
					return value;
				} catch (retryError) {
					router.recordOutcome({ connection: alternate, error: retryError });
					throw retryError;
				}
			}
		} catch (error) {
			const classified = classifyErrorReason(targetRedis, error);
			const reason: UnavailableReason = classified ?? "other";
			warnRedisUnavailable({ source, reason, error });
			throw new RedisUnavailableError({ source, reason, cause: error });
		}
	} finally {
		if (readLaneLease && redisAttempts.length === 0) readLaneLease.release();
		if (readLaneLease && redisAttempts.length > 0) {
			// Caller deadlines must not make a running command look like spare capacity.
			void Promise.allSettled(redisAttempts).then(() =>
				readLaneLease.release(),
			);
		}
	}
};

/**
 * Fail-open variant of `runRedisOp`. On failure: runs `onError`, returns
 * `undefined`. Use this from mutation/invalidation paths where a Redis
 * outage shouldn't propagate — the cache goes stale, not the request.
 */
export const tryRedisOp = async <T>({
	operation,
	source,
	redisInstance,
	queueIfNotReady,
	retryOnStandby,
	useReadPool,
	timeoutMs,
	onError,
}: {
	operation: (redis: Redis) => Promise<T>;
	source: string;
	redisInstance: Redis;
	queueIfNotReady?: boolean;
	retryOnStandby?: boolean;
	useReadPool?: boolean;
	timeoutMs?: number;
	onError?: (error: unknown) => void;
}): Promise<T | undefined> => {
	try {
		return await runRedisOp({
			operation,
			source,
			redisInstance,
			queueIfNotReady,
			retryOnStandby,
			useReadPool,
			timeoutMs,
		});
	} catch (error) {
		onError?.(error);
		return undefined;
	}
};
