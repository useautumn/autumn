import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
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

/**
 * Helper function to normalize empty objects {} to empty arrays []
 * Lua's cjson converts empty arrays to empty objects, so we need to fix this
 */
export const normalizeArray = (value: unknown): unknown => {
	if (
		value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.keys(value).length === 0
	) {
		return [];
	}
	return value;
};

/**
 * Normalize a single balance object from cache
 * Handles Lua cjson quirks for balance objects
 */
export const normalizeCachedBalance = (balance: any): any => {
	if (!balance) return balance;

	// Fix reset field
	if (!balance.reset || balance.reset === null) {
		balance.reset = undefined;
	}

	// Fix breakdown reset fields
	if (balance.breakdown) {
		for (const breakdown of balance.breakdown) {
			if (!breakdown.reset || breakdown.reset === null) {
				breakdown.reset = undefined;
			}
		}
	}

	return balance;
};

/**
 * Fix Lua cjson quirks when parsing cached data:
 * - Converts empty objects {} back to [] for all array fields
 * - Converts usage_limit: 0 to undefined (when all sources were undefined)
 */
export const normalizeCachedData = <T extends ApiCustomer | ApiEntityV1>(
	data: T,
): T => {
	// Normalize top-level products array
	if (data.subscriptions) {
		if (!Array.isArray(data.subscriptions)) {
			data.subscriptions = [];
		}

		// Normalize nested arrays in products
		for (const subscription of data.subscriptions) {
			// Normalize product.items array
			if (subscription.plan) {
				subscription.plan.features = normalizeArray(
					subscription.plan.features,
				) as typeof subscription.plan.features;
			}
		}
	}

	// Normalize entities array (included in Lua script)
	if ("entities" in data && data.entities) {
		data.entities = normalizeArray(data.entities) as typeof data.entities;
	}

	// Fix usage_limit: 0 -> undefined
	// Fix missing credit_schema -> null
	if (data.balances) {
		for (const featureId in data.balances) {
			const feature = data.balances[featureId];

			// if (!feature.reset) {
			// 	feature.reset = null;
			// }

			if (
				!Array.isArray(feature.breakdown) &&
				typeof feature.breakdown === "object"
			) {
				feature.breakdown = undefined;
			}

			if (
				!Array.isArray(feature.rollovers) &&
				typeof feature.rollovers === "object"
			) {
				feature.rollovers = undefined;
			}

			if (feature.breakdown) {
				for (const breakdown of feature.breakdown) {
					// if (!breakdown.reset) {
					// 	breakdown.reset = null;
					// }
				}
			}

			// if (feature.usage_limit === 0 || feature.usage_limit === null) {
			// 	feature.usage_limit = undefined;
			// }

			// // Ensure credit_schema is null if undefined (for consistent schema)
			// if (feature.credit_schema === null) {
			// 	feature.credit_schema = undefined;
			// }

			// if (feature.interval_count === undefined) {
			// 	feature.interval_count = null;
			// }

			// // interval should be null if undefined
			// if (feature.interval === undefined) {
			// 	feature.interval = null;
			// }

			// Fix breakdown usage_limit
			// if (feature.breakdown) {
			// 	for (const breakdown of feature.breakdown) {
			// 		if (breakdown.usage_limit === 0) {
			// 			breakdown.usage_limit = undefined;
			// 		}

			// 		// if (breakdown.next_reset_at === undefined) {
			// 		// 	breakdown.next_reset_at = null;
			// 		// }
			// 	}
			// }
		}
	}

	return data;
};
