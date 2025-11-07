import type { ApiCustomer, ApiEntity } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import { logger } from "../../external/logtail/logtailUtils.js";

/**
 * Executes a Redis write operation with automatic fallback handling.
 * Returns true if successful, false if Redis is unavailable or operation fails.
 *
 * @param operation - The Redis write operation to execute
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export const tryRedisWrite = async (
	operation: () => Promise<unknown>,
): Promise<boolean> => {
	if (redis.status !== "ready") {
		logger.error("Redis not ready, skipping write");
		return false;
	}

	try {
		await operation();
		return true;
	} catch (error) {
		logger.error(`Redis write failed: ${error}`);
		return false;
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
 * Fix Lua cjson quirks when parsing cached data:
 * - Converts products[].items from {} back to [] if it's an empty object
 * - Converts usage_limit: 0 to undefined (when all sources were undefined)
 */
export const normalizeCachedData = <T extends ApiCustomer | ApiEntity>(
	data: T,
): T => {
	if (data.products) {
		for (const product of data.products) {
			if (
				product.items &&
				typeof product.items === "object" &&
				!Array.isArray(product.items) &&
				Object.keys(product.items).length === 0
			) {
				product.items = [];
			}
		}
	}

	// Convert empty entities to []
	if ("entities" in data && data.entities && !Array.isArray(data.entities)) {
		data.entities = [];
	}

	// Fix usage_limit: 0 -> undefined
	// Fix missing credit_schema -> null
	if (data.features) {
		for (const featureId in data.features) {
			const feature = data.features[featureId];
			if (feature.usage_limit === 0) {
				feature.usage_limit = undefined;
			}

			// Ensure credit_schema is null if undefined (for consistent schema)
			if (feature.credit_schema === null) {
				feature.credit_schema = undefined;
			}

			// // interval should be null if undefined
			// if (feature.interval === undefined) {
			// 	feature.interval = null;
			// }

			// Fix breakdown usage_limit
			if (feature.breakdown) {
				for (const breakdown of feature.breakdown) {
					if (breakdown.usage_limit === 0) {
						breakdown.usage_limit = undefined;
					}
				}
			}
		}
	}

	return data;
};
