import type { Redis } from "ioredis";
import { redis } from "@/external/redis/initRedis.js";
import { logger } from "../../external/logtail/logtailUtils.js";

/**
 * Executes a Redis SET ... NX and routes the three possible outcomes to callbacks:
 * - `"OK"` (key was set) → `onSuccess`
 * - `null` (key already exists) → `onKeyAlreadyExists`
 * - Redis unavailable / error → `onRedisUnavailable`
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
		if (targetRedis.status !== "ready") {
			logger.error("Redis not ready, skipping NX write");
			return await onRedisUnavailable();
		}

		const result = await operation();
		if (result === "OK") return await onSuccess();
		return await onKeyAlreadyExists();
	} catch (error) {
		logger.error(`Redis NX write failed: ${error}`);
		return await onRedisUnavailable();
	}
};

/**
 * Executes a Redis write operation with automatic fallback handling.
 * Returns the result of the operation if successful, null if Redis is unavailable or operation fails.
 * If the operation returns void/undefined, returns true instead.
 *
 * @param operation - The Redis write operation to execute
 * @param redisInstance - Optional Redis instance to use (defaults to local region instance)
 * @returns Promise<T | null | true> - The result if successful, null otherwise. Returns true if operation returns void/undefined.
 */
export const tryRedisWrite = async <T>(
	operation: () => Promise<T>,
	redisInstance?: Redis,
): Promise<T extends void ? true : T | null> => {
	const targetRedis = redisInstance ?? redis;

	try {
		if (targetRedis.status !== "ready") {
			logger.error("Redis not ready, skipping write");
			return null as T extends void ? true : T | null;
		}

		const result = await operation();
		return (result === undefined ? true : result) as T extends void
			? true
			: T | null;
	} catch (error) {
		logger.error(`Redis write failed: ${error}`);
		return null as T extends void ? true : T | null;
	}
};

/**
 * Executes a Redis read operation with automatic fallback handling.
 * Returns the data if successful, null if Redis is unavailable or operation fails.
 *
 * @param operation - The Redis read operation to execute
 * @param redisInstance - Optional Redis instance to use (defaults to local region instance)
 * @returns Promise<T | null> - The data if successful, null otherwise
 */
export const tryRedisRead = async <T>(
	operation: () => Promise<T>,
	redisInstance?: Redis,
): Promise<T | null> => {
	const targetRedis = redisInstance ?? redis;

	try {
		if (targetRedis.status !== "ready") {
			logger.error("Redis not ready, skipping read");
			return null;
		}

		const result = await operation();
		return result;
	} catch (error) {
		logger.error(`Redis read failed: ${error}`);
		return null;
	}
};
