import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import {
	markRedisCommandFailure,
	markRedisCommandSuccess,
} from "@/external/redis/initUtils/redisAvailability.js";

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
			markRedisCommandFailure();
			warnRedisUnavailable({ source: "tryRedisNx:not-ready" });
			return await onRedisUnavailable();
		}

		const result = await operation();
		markRedisCommandSuccess();
		if (result === "OK") return await onSuccess();
		return await onKeyAlreadyExists();
	} catch (error) {
		markRedisCommandFailure();
		warnRedisUnavailable({ source: "tryRedisNx:error", error });
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
			markRedisCommandFailure();
			warnRedisUnavailable({ source: "tryRedisWrite:not-ready" });
			return null as T extends void ? true : T | null;
		}

		const result = await operation();
		markRedisCommandSuccess();

		return (result === undefined ? true : result) as T extends void
			? true
			: T | null;
	} catch (error) {
		markRedisCommandFailure();
		warnRedisUnavailable({ source: "tryRedisWrite:error", error });
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
			markRedisCommandFailure();
			warnRedisUnavailable({ source: "tryRedisRead:not-ready" });
			return null;
		}

		const result = await operation();
		markRedisCommandSuccess();
		return result;
	} catch (error) {
		markRedisCommandFailure();
		warnRedisUnavailable({ source: "tryRedisRead:error", error });
		return null;
	}
};
