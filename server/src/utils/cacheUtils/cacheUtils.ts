import type { Redis } from "ioredis";
import { redis } from "@/external/redis/initRedis.js";
import { logger } from "../../external/logtail/logtailUtils.js";

/**
 * Only bail when the connection is permanently dead (`end`).
 * Transient states like `reconnecting` / `connecting` / `close` are handled
 * by ioredis's offline queue + commandTimeout, so commands still land.
 */
export const isRedisDown = (instance: Redis): boolean => {
	if (instance.status === "end") {
		logger.error(
			"[Redis] Connection permanently ended — all operations will be skipped until restart",
			{ type: "redis_down", status: instance.status },
		);
		return true;
	}
	return false;
};

/**
 * Executes a Redis SET ... NX and routes the three possible outcomes to callbacks.
 */
export const tryRedisNx = async <TUnavailable, TSuccess, TExists>({
	operation,
	redisInstance,
	onRedisUnavailable,
	onSuccess,
	onKeyAlreadyExists,
}: {
	operation: () => Promise<"OK" | null>;
	redisInstance?: Redis;
	onRedisUnavailable: () => TUnavailable | Promise<TUnavailable>;
	onSuccess: () => TSuccess | Promise<TSuccess>;
	onKeyAlreadyExists: () => TExists | Promise<TExists>;
}): Promise<TUnavailable | TSuccess | TExists> => {
	const targetRedis = redisInstance ?? redis;

	try {
		if (isRedisDown(targetRedis)) {
			logger.error(
				`[tryRedisNx] Redis connection ended (status=${targetRedis.status}) — skipping NX write`,
			);
			return await onRedisUnavailable();
		}

		const result = await operation();
		if (result === "OK") return await onSuccess();
		return await onKeyAlreadyExists();
	} catch (error) {
		const errMsg =
			error instanceof Error
				? `${error.name}: ${error.message}`
				: String(error);
		logger.error(`[tryRedisNx] Redis NX write FAILED: ${errMsg}`, {
			type: "redis_nx_error",
			errorName: error instanceof Error ? error.name : "unknown",
			errorMessage: errMsg,
			redisStatus: targetRedis.status,
		});
		return await onRedisUnavailable();
	}
};

/**
 * Executes a Redis write operation with automatic fallback handling.
 * Returns the result of the operation if successful, null if Redis is unavailable or operation fails.
 * If the operation returns void/undefined, returns true instead.
 */
export const tryRedisWrite = async <T>(
	operation: () => Promise<T>,
	redisInstance?: Redis,
): Promise<T extends void ? true : T | null> => {
	const targetRedis = redisInstance ?? redis;

	try {
		if (isRedisDown(targetRedis)) {
			logger.error(
				`[tryRedisWrite] Redis connection ended (status=${targetRedis.status}) — skipping write`,
			);
			return null as T extends void ? true : T | null;
		}

		const result = await operation();
		return (result === undefined ? true : result) as T extends void
			? true
			: T | null;
	} catch (error) {
		const errMsg =
			error instanceof Error
				? `${error.name}: ${error.message}`
				: String(error);
		logger.error(
			`[tryRedisWrite] Redis write FAILED (returning null): ${errMsg}`,
			{
				type: "redis_write_error",
				errorName: error instanceof Error ? error.name : "unknown",
				errorMessage: errMsg,
				redisStatus: targetRedis.status,
			},
		);
		return null as T extends void ? true : T | null;
	}
};

/**
 * Executes a Redis read operation with automatic fallback handling.
 * Returns the data if successful, null if Redis is unavailable or operation fails.
 */
export const tryRedisRead = async <T>(
	operation: () => Promise<T>,
	redisInstance?: Redis,
): Promise<T | null> => {
	const targetRedis = redisInstance ?? redis;

	try {
		if (isRedisDown(targetRedis)) {
			logger.error(
				`[tryRedisRead] Redis connection ended (status=${targetRedis.status}) — skipping read`,
			);
			return null;
		}

		const result = await operation();
		return result;
	} catch (error) {
		const errMsg =
			error instanceof Error
				? `${error.name}: ${error.message}`
				: String(error);
		logger.error(
			`[tryRedisRead] Redis read FAILED (returning null): ${errMsg}`,
			{
				type: "redis_read_error",
				errorName: error instanceof Error ? error.name : "unknown",
				errorMessage: errMsg,
				redisStatus: targetRedis.status,
			},
		);
		return null;
	}
};
