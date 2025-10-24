import type { Entitlement, Price, ProductV2 } from "@autumn/shared";

/**
 * Converts ProductV2 (items-based) to V1 format (entitlements + prices)
 *
 * NOTE: This is a lightweight type conversion for TEST purposes only.
 * For actual production conversion, use server-side utilities in:
 * @see server/src/internal/products/product-items/productItemUtils/itemToPriceAndEnt.ts
 *
 * @param productV2 - V2 product with items array
 * @param entitlements - Converted entitlements from itemToPriceAndEnt
 * @param prices - Converted prices from itemToPriceAndEnt
 * @returns V1-format product object
 */
export const productV2ToV1 = ({
	productV2,
	entitlements,
	prices,
}: {
	productV2: ProductV2;
	entitlements: Entitlement[];
	prices: Price[];
}) => {
	// Convert entitlements array to record keyed by feature_id
	const entitlementsRecord: Record<string, Entitlement> = {};
	for (const ent of entitlements) {
		if (ent.feature_id) {
			entitlementsRecord[ent.feature_id] = ent;
		}
	}

	return {
		id: productV2.id,
		name: productV2.name,
		is_default: productV2.is_default,
		is_add_on: productV2.is_add_on,
		entitlements: entitlementsRecord,
		prices,
		free_trial: productV2.free_trial,
		group: productV2.group,
	};
};
