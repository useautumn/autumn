import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { UnavailableReason } from "@/external/redis/utils/runRedisOp.js";

const REDIS_WARNING_INTERVAL_MS = 30_000;
const lastRedisWarningAtBySource = new Map<string, number>();

const warnRedisUnavailable = ({
	source,
	error,
}: {
	source: string;
	error?: unknown;
}) => {
	const now = Date.now();
	const lastWarningAt = lastRedisWarningAtBySource.get(source) ?? 0;
	if (now - lastWarningAt < REDIS_WARNING_INTERVAL_MS) return;

	lastRedisWarningAtBySource.set(source, now);
	logger.warn(
		{
			source,
			error: error instanceof Error ? error.message : undefined,
		},
		"[redis] operation unavailable",
	);
};

const classifyRedisUnavailable = (
	targetRedis: Redis,
	error?: unknown,
): UnavailableReason | null => {
	if (targetRedis.status !== "ready") return "not_ready";
	const message = error instanceof Error ? error.message : String(error);
	if (/ETIMEDOUT|timeout|timed out/i.test(message)) return "timeout";
	if (/ECONN|closed|writeable|max retries/i.test(message)) return "connection";
	return null;
};

const throwIfRedisUnavailable = ({
	targetRedis,
	source,
	error,
}: {
	targetRedis: Redis;
	source: string;
	error?: unknown;
}) => {
	warnRedisUnavailable({ source, error });

	const reason = classifyRedisUnavailable(targetRedis, error);
	if (reason) {
		throw new RedisUnavailableError({ source, reason, cause: error });
	}
};

export const tryRedisWrite = async <T>(
	operation: () => Promise<T>,
	redisInstance?: Redis,
): Promise<T extends void ? true : T | null> => {
	const targetRedis = redisInstance ?? getMiscRedis();

	try {
		if (targetRedis.status !== "ready") {
			throwIfRedisUnavailable({
				targetRedis,
				source: "tryRedisWrite:not-ready",
			});
			return null as T extends void ? true : T | null;
		}

		const result = await operation();

		return (result === undefined ? true : result) as T extends void
			? true
			: T | null;
	} catch (error) {
		if (error instanceof RedisUnavailableError) throw error;
		throwIfRedisUnavailable({
			targetRedis,
			source: "tryRedisWrite:error",
			error,
		});
		return null as T extends void ? true : T | null;
	}
};

export const tryRedisRead = async <T>(
	operation: () => Promise<T>,
	redisInstance?: Redis,
): Promise<T | null> => {
	const targetRedis = redisInstance ?? getMiscRedis();

	try {
		if (targetRedis.status !== "ready") {
			throwIfRedisUnavailable({
				targetRedis,
				source: "tryRedisRead:not-ready",
			});
			return null;
		}

		const result = await operation();
		return result;
	} catch (error) {
		if (error instanceof RedisUnavailableError) throw error;
		throwIfRedisUnavailable({
			targetRedis,
			source: "tryRedisRead:error",
			error,
		});
		return null;
	}
};
