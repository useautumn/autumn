import { trace } from "@opentelemetry/api";
import type { Redis } from "ioredis";
import { redis } from "@/external/redis/initRedis.js";
import { logger } from "../../external/logtail/logtailUtils.js";

const tracer = trace.getTracer("redis");

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
	const span = tracer.startSpan("redis.write");
	const targetRedis = redisInstance ?? redis;

	try {
		if (targetRedis.status !== "ready") {
			logger.error("Redis not ready, skipping write");
			span.setStatus({ code: 2, message: "Redis not ready" });
			return null as T extends void ? true : T | null;
		}

		const result = await operation();
		span.setStatus({ code: 1 }); // OK
		// If operation returns void/undefined, return true; otherwise return the result
		return (result === undefined ? true : result) as T extends void
			? true
			: T | null;
	} catch (error) {
		logger.error(`Redis write failed: ${error}`);
		span.setStatus({
			code: 2,
			message: error instanceof Error ? error.message : String(error),
		});
		return null as T extends void ? true : T | null;
	} finally {
		span.end();
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
	const span = tracer.startSpan("redis.read");
	const targetRedis = redisInstance ?? redis;

	try {
		if (targetRedis.status !== "ready") {
			logger.error("Redis not ready, skipping read");
			span.setStatus({ code: 2, message: "Redis not ready" });
			return null;
		}

		const result = await operation();
		span.setStatus({ code: 1 }); // OK
		return result;
	} catch (error) {
		logger.error(`Redis read failed: ${error}`);
		span.setStatus({
			code: 2,
			message: error instanceof Error ? error.message : String(error),
		});
		return null;
	} finally {
		span.end();
	}
};
