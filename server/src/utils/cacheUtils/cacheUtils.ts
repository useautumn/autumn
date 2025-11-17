import { redis } from "@/external/redis/initRedis.js";
import { logger } from "../../external/logtail/logtailUtils.js";

/**
 * Executes a Redis write operation with automatic fallback handling.
 * Returns the result of the operation if successful, null if Redis is unavailable or operation fails.
 * If the operation returns void/undefined, returns true instead.
 *
 * @param operation - The Redis write operation to execute
 * @returns Promise<T | null | true> - The result if successful, null otherwise. Returns true if operation returns void/undefined.
 */
export const tryRedisWrite = async <T>(
	operation: () => Promise<T>,
): Promise<T extends void ? true : T | null> => {
	if (redis.status !== "ready") {
		logger.error("Redis not ready, skipping write");
		return null as T extends void ? true : T | null;
	}

	try {
		const result = await operation();
		// If operation returns void/undefined, return true; otherwise return the result
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
 * @returns Promise<T | null> - The data if successful, null otherwise
 */
export const tryRedisRead = async <T>(
	operation: () => Promise<T>,
): Promise<T | null> => {
	if (redis.status !== "ready") {
		logger.error("Redis not ready, skipping read");
		return null;
	}

	try {
		return await operation();
	} catch (error) {
		logger.error(`Redis read failed: ${error}`);
		return null;
	}
};
