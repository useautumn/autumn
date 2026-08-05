import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import {
	getStandbyRedisPair,
	isRedisReadyWithStandby,
} from "../initUtils/standbyRedis.js";
import { RedisUnavailableError } from "./errors.js";
import { isConnectionLevelRedisError } from "./isTransientRedisError.js";

const REDIS_WARNING_INTERVAL_MS = 30_000;
/** Below this a retry cannot finish, so spend the budget on the fallback. */
const MIN_RETRY_BUDGET_MS = 50;
const lastRedisWarningAtBySource = new Map<string, number>();

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
	timeoutMs,
}: {
	/** Receives the connection to run against. With `retryOnStandby` it must use
	 *  that argument; closing over the outer client re-runs the same socket. */
	operation: (redis: Redis) => Promise<T>;
	source: string;
	redisInstance: Redis;
	queueIfNotReady?: boolean;
	/** Retry a failed idempotent read once on the paired standby connection. */
	retryOnStandby?: boolean;
	/** Opt-in bound, tighter than the client's `commandTimeout`. Reads only —
	 *  the race abandons the promise but the command still reaches Redis. */
	timeoutMs?: number;
}): Promise<T> => {
	const targetRedis = redisInstance;

	if (!queueIfNotReady && !isRedisReadyWithStandby(targetRedis)) {
		const reason: UnavailableReason = "not_ready";
		warnRedisUnavailable({ source, reason });
		throw new RedisUnavailableError({ source, reason });
	}

	// One budget for the whole op, not one per attempt: a retry must not double
	// the ceiling the caller sized against its non-Redis fallback.
	const deadlineAt = timeoutMs ? Date.now() + timeoutMs : undefined;

	// The message must contain "timeout" so classifyErrorReason maps it to
	// `timeout` rather than `other` — withTimeout's default says "timed out".
	const runAttempt = (redis: Redis, budgetMs?: number) =>
		budgetMs
			? withTimeout({
					timeoutMs: budgetMs,
					fn: () => operation(redis),
					timeoutMessage: `[redis] ${source} timeout after ${budgetMs}ms`,
				})
			: operation(redis);

	try {
		const pair = retryOnStandby ? getStandbyRedisPair(targetRedis) : undefined;
		if (!pair) return await runAttempt(targetRedis, timeoutMs);

		const [preferred, alternate] = pair.ordered();
		try {
			const value = await runAttempt(preferred, timeoutMs);
			pair.recordOutcome({ connection: preferred });
			return value;
		} catch (firstError) {
			pair.recordOutcome({ connection: preferred, error: firstError });

			const remainingMs = deadlineAt ? deadlineAt - Date.now() : undefined;
			const canRetry =
				alternate.status === "ready" &&
				isConnectionLevelRedisError({ error: firstError }) &&
				(remainingMs === undefined || remainingMs >= MIN_RETRY_BUDGET_MS);
			if (!canRetry) throw firstError;

			try {
				const value = await runAttempt(alternate, remainingMs);
				pair.recordOutcome({ connection: alternate });
				logger.info(
					{ source, type: "redis_standby_failover" },
					"[redis] standby served a read the preferred connection failed",
				);
				return value;
			} catch (retryError) {
				pair.recordOutcome({ connection: alternate, error: retryError });
				throw retryError;
			}
		}
	} catch (error) {
		const classified = classifyErrorReason(targetRedis, error);
		const reason: UnavailableReason = classified ?? "other";
		warnRedisUnavailable({ source, reason, error });
		throw new RedisUnavailableError({ source, reason, cause: error });
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
	timeoutMs,
	onError,
}: {
	operation: (redis: Redis) => Promise<T>;
	source: string;
	redisInstance: Redis;
	queueIfNotReady?: boolean;
	retryOnStandby?: boolean;
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
			timeoutMs,
		});
	} catch (error) {
		onError?.(error);
		return undefined;
	}
};
