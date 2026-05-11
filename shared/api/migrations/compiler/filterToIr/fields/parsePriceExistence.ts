import { makeExistenceParser } from "./makeExistenceParser.js";

/**
 * Phase 1 supports only existence checks on `price` (paid vs free):
 *   price: null           → entitlement-only item (no price)
 *   price: { $ne: null }  → has a price (paid item)
 * Filtering on nested price fields (billing_method, etc.) is deferred.
 */
export const parsePriceExistence = makeExistenceParser({
	field: "price",
	scopePath: "plan.item.price",
});
