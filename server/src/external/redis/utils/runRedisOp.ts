import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import { RedisUnavailableError } from "./errors.js";

const REDIS_WARNING_INTERVAL_MS = 30_000;
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
}: {
	operation: () => Promise<T>;
	source: string;
	redisInstance?: Redis;
	queueIfNotReady?: boolean;
}): Promise<T> => {
	const targetRedis = redisInstance ?? redis;

	if (!queueIfNotReady && targetRedis.status !== "ready") {
		const reason: UnavailableReason = "not_ready";
		warnRedisUnavailable({ source, reason });
		throw new RedisUnavailableError({ source, reason });
	}

	try {
		const value = await operation();
		return value;
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
	onError,
}: {
	operation: () => Promise<T>;
	source: string;
	redisInstance?: Redis;
	queueIfNotReady?: boolean;
	onError?: (error: unknown) => void;
}): Promise<T | undefined> => {
	try {
		return await runRedisOp({
			operation,
			source,
			redisInstance,
			queueIfNotReady,
		});
	} catch (error) {
		onError?.(error);
		return undefined;
	}
};
