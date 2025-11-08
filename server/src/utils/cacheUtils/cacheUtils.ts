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
 * Helper function to normalize empty objects {} to empty arrays []
 * Lua's cjson converts empty arrays to empty objects, so we need to fix this
 */
const normalizeArray = (value: unknown): unknown => {
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
 * Fix Lua cjson quirks when parsing cached data:
 * - Converts empty objects {} back to [] for all array fields
 * - Converts usage_limit: 0 to undefined (when all sources were undefined)
 */
export const normalizeCachedData = <T extends ApiCustomer | ApiEntity>(
	data: T,
): T => {
	// Normalize top-level products array
	if (data.products) {
		if (!Array.isArray(data.products)) {
			data.products = [];
		}

		// Normalize nested arrays in products
		for (const product of data.products) {
			// Normalize product.items array
			if (product.items) {
				product.items = normalizeArray(product.items) as typeof product.items;
			}

			// Normalize product.stripe_subscription_ids array
			if (product.stripe_subscription_ids) {
				product.stripe_subscription_ids = normalizeArray(
					product.stripe_subscription_ids,
				) as typeof product.stripe_subscription_ids;
			}
		}
	}

	// Normalize entities array (included in Lua script)
	if ("entities" in data && data.entities) {
		data.entities = normalizeArray(data.entities) as typeof data.entities;
	}

	// Fix usage_limit: 0 -> undefined
	// Fix missing credit_schema -> null
	if (data.features) {
		for (const featureId in data.features) {
			const feature = data.features[featureId];
			if (feature.usage_limit === 0 || feature.usage_limit === null) {
				feature.usage_limit = undefined;
			}

			// Ensure credit_schema is null if undefined (for consistent schema)
			if (feature.credit_schema === null) {
				feature.credit_schema = undefined;
			}

			// if (feature.interval_count === undefined) {
			// 	feature.interval_count = null;
			// }

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

					// if (breakdown.next_reset_at === undefined) {
					// 	breakdown.next_reset_at = null;
					// }
				}
			}

			// Normalize feature.credit_schema array
			if (feature.credit_schema) {
				feature.credit_schema = normalizeArray(
					feature.credit_schema,
				) as typeof feature.credit_schema;
			}
		}
	}

	return data;
};
