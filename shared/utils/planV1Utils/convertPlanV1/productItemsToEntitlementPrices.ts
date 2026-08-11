import { findFeatureById } from "@utils/featureUtils/findFeatureUtils.js";
import { enrichEntitlementWithFeature } from "@utils/productUtils/entUtils/enrichEntitlement.js";
import type {
	BasePriceAndEntitlementPrices,
	EntitlementPrice,
} from "@utils/productUtils/entitlementPriceUtils/entitlementPriceTypes.js";
import {
	isFeatureItem,
	isPriceItem,
} from "@utils/productV2Utils/productItemUtils/getItemType.js";
import { itemToPriceAndEnt } from "@utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";
import type { Product } from "../../../models/productModels/productModels.js";
import type { ProductItem } from "../../../models/productV2Models/productItemModels/productItemModels.js";

/**
 * Mint desired base Price + EntitlementPrice rows from ProductItems.
 * Construction only — no claim/classification against current rows.
 */
export const productItemsToEntitlementPrices = ({
	items,
	product,
	features,
}: {
	items: ProductItem[];
	/** Stamp only — org_id / internal_id. */
	product: Pick<Product, "org_id" | "internal_id">;
	features: Feature[];
}): BasePriceAndEntitlementPrices => {
	let basePrice: Price | undefined;
	const entitlementPrices: EntitlementPrice[] = [];

	for (const item of items) {
		const feature = item.feature_id
			? findFeatureById({ features, featureId: item.feature_id })
			: undefined;

		// No curPrice/curEnt → itemToPriceAndEnt always returns the minted
		// definition in `new*`. Claim classifies later.
		const { newPrice, newEnt } = itemToPriceAndEnt({
			item,
			orgId: product.org_id,
			internalProductId: product.internal_id,
			feature,
			isCustom: false,
			newVersion: false,
			features,
		});

		if (isPriceItem(item)) {
			if (newPrice) basePrice = newPrice;
			continue;
		}

		if (!newEnt || !feature) continue;

		entitlementPrices.push({
			entitlement: enrichEntitlementWithFeature({
				entitlement: newEnt,
				feature,
			}),
			price: isFeatureItem(item) ? undefined : (newPrice ?? undefined),
		});
	}

	return { basePrice, entitlementPrices };
};
