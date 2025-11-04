import type { ApiCustomer, ApiEntity } from "@autumn/shared";

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
