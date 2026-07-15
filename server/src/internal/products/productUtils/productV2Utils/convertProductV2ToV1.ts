import type {
	CreateFreeTrial,
	Entitlement,
	Feature,
	Price,
	ProductV2,
} from "@autumn/shared";
import { itemToPriceAndEnt } from "@/internal/products/product-items/productItemUtils/itemToPriceAndEnt.js";

/**
 * V1 product format with entitlements as a record.
 * Different from FullProduct which has entitlements as an array.
 */
type ProductV1 = {
	id: string;
	name: string;
	is_default: boolean;
	is_add_on: boolean;
	entitlements: Record<string, Entitlement>;
	prices: Price[];
	free_trial: CreateFreeTrial | null;
	group: string;
};

/**
 * Converts ProductV2 (items-based) to V1 format (entitlements + prices) via the
 * production itemToPriceAndEnt converter, so the derived prices/entitlements
 * match what gets persisted. Used in tests and in version-time license link
 * validation (handleVersionProduct) to build the new version's prices in memory.
 */
export const convertProductV2ToV1 = ({
	productV2,
	orgId,
	features,
}: {
	productV2: ProductV2;
	orgId: string;
	features: Feature[];
}): ProductV1 => {
	const entitlements: Entitlement[] = [];
	const prices: Price[] = [];

	for (const item of productV2.items) {
		const feature = features.find((f) => f.id === item.feature_id);

		// Use production conversion utilities
		const { newEnt, newPrice, sameEnt, samePrice } = itemToPriceAndEnt({
			item,
			orgId,
			internalProductId: "test",
			feature,
			isCustom: false,
			features,
		});

		const ent = newEnt || sameEnt;
		const price = newPrice || samePrice;

		if (ent) {
			entitlements.push(ent);
		}
		if (price) {
			prices.push(price);
		}
	}

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
		free_trial: productV2.free_trial ?? null,
		group: productV2.group ?? "",
	};
};
