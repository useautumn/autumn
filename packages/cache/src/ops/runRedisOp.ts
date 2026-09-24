import { withTimeout } from "@autumn/shared";
import type { Redis } from "ioredis";
import { clientLoggerOf } from "../client/clientLogger.js";
import {
	RedisUnavailableError,
	type UnavailableReason,
} from "./redisErrors.js";

const REDIS_WARNING_INTERVAL_MS = 30_000;
const lastWarningAtBySource = new Map<string, number>();

const classifyErrorReason = ({
	redis,
	error,
}: {
	redis: Redis;
	error: unknown;
}): UnavailableReason => {
	if (redis.status !== "ready") return "not_ready";
	const message = error instanceof Error ? error.message : String(error);
	if (/ETIMEDOUT|timeout/i.test(message)) return "timeout";
	if (/ECONN|closed|writeable|max retries/i.test(message)) return "connection";
	return "other";
};

/** One warning per source and reason every 30s: an outage must not flood the log. */
const warnRedisUnavailable = ({
	redis,
	source,
	reason,
	error,
}: {
	redis: Redis;
	source: string;
	reason: UnavailableReason;
	error?: unknown;
}): void => {
	const key = `${source}:${reason}`;
	const now = Date.now();
	if (now - (lastWarningAtBySource.get(key) ?? 0) < REDIS_WARNING_INTERVAL_MS)
		return;
	lastWarningAtBySource.set(key, now);
	clientLoggerOf({ redis }).warn(
		{
			source,
			reason,
			error: error instanceof Error ? error.message : undefined,
		},
		"[redis] operation unavailable",
	);
};

export type RunRedisOpParams<T> = {
	operation: (redis: Redis) => Promise<T>;
	source: string;
	redisInstance: Redis;
	/** Let the command wait out a reconnect in ioredis's offline queue instead of failing at once. */
	queueIfNotReady?: boolean;
	/** A budget tighter than the client's command timeout; the race abandons the promise, the command still runs. */
	timeoutMs?: number;
};

/**
 * Runs one operation; throws `RedisUnavailableError` on not-ready, timeout or connection failure.
 * Not-ready throws at once rather than letting the command sit in the offline queue for the whole command timeout.
 */
export const runRedisOp = async <T>({
	operation,
	source,
	redisInstance,
	queueIfNotReady = false,
	timeoutMs,
}: RunRedisOpParams<T>): Promise<T> => {
	if (!queueIfNotReady && redisInstance.status !== "ready") {
		warnRedisUnavailable({ redis: redisInstance, source, reason: "not_ready" });
		throw new RedisUnavailableError({ source, reason: "not_ready" });
	}
	try {
		const attempt = operation(redisInstance);
		return timeoutMs
			? await withTimeout({
					timeoutMs,
					fn: () => attempt,
					timeoutMessage: `[redis] ${source} timeout after ${timeoutMs}ms`,
				})
			: await attempt;
	} catch (error) {
		const reason = classifyErrorReason({ redis: redisInstance, error });
		warnRedisUnavailable({ redis: redisInstance, source, reason, error });
		throw new RedisUnavailableError({ source, reason, cause: error });
	}
};

/** Fail-open `runRedisOp`: on failure runs `onError` and returns undefined, so the cache goes stale, not the request. */
export const tryRedisOp = async <T>({
	onError,
	...params
}: RunRedisOpParams<T> & {
	onError?: (error: unknown) => void;
}): Promise<T | undefined> => {
	try {
		return await runRedisOp(params);
	} catch (error) {
		onError?.(error);
		return undefined;
	}
};
