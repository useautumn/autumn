import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import {
	markRedisCommandFailure,
	markRedisCommandSuccess,
} from "@/external/redis/initUtils/redisAvailability.js";
import { RedisUnavailableError } from "./errors.js";

const REDIS_WARNING_INTERVAL_MS = 30_000;
const lastRedisWarningAtBySource = new Map<string, number>();

const markDefaultRedisAvailability = (
	targetRedis: Redis,
	available: boolean,
) => {
	if (targetRedis !== redis) return;
	available ? markRedisCommandSuccess() : markRedisCommandFailure();
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
 */
export const runRedisOp = async <T>({
	operation,
	source,
	redisInstance,
}: {
	operation: () => Promise<T>;
	source: string;
	redisInstance?: Redis;
}): Promise<T> => {
	const targetRedis = redisInstance ?? redis;

	try {
		const value = await operation();
		markDefaultRedisAvailability(targetRedis, true);
		return value;
	} catch (error) {
		const classified = classifyErrorReason(targetRedis, error);
		const reason: UnavailableReason = classified ?? "other";
		if (classified !== null) {
			markDefaultRedisAvailability(targetRedis, false);
		}
		warnRedisUnavailable({ source, reason, error });
		throw new RedisUnavailableError({ source, reason, cause: error });
	}
};
