import { findFeatureById } from "@utils/featureUtils/findFeatureUtils.js";
import type {
	BasePriceAndEntitlementPrices,
	EntitlementPrice,
} from "@utils/productUtils/entitlementPriceUtils/entitlementPriceTypes.js";
import { enrichEntitlementWithFeature } from "@utils/productUtils/entUtils/enrichEntitlement.js";
import { isFixedPrice } from "@utils/productUtils/priceUtils/classifyPriceUtils.js";
import { findPriceByFeatureId } from "@utils/productUtils/priceUtils/findPrice/findPriceByFeatureId.js";
import {
	type UnlinkedStripeSlotsByPriceId,
	unlinkedStripeSlotsForItem,
} from "@utils/productUtils/priceUtils/match/stripePriceMappingSlots.js";
import {
	isFeatureItem,
	isPriceItem,
} from "@utils/productV2Utils/productItemUtils/getItemType.js";
import { itemToPriceAndEnt } from "@utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";
import type { Product } from "../../../models/productModels/productModels.js";
import type { ProductItem } from "../../../models/productV2Models/productItemModels/productItemModels.js";

const stripeReusePriceForItem = ({
	item,
	prices,
}: {
	item: ProductItem;
	prices: Price[];
}): Price | undefined => {
	if (isPriceItem(item)) return prices.find(isFixedPrice);
	if (!item.feature_id) return undefined;
	return findPriceByFeatureId({ prices, featureId: item.feature_id });
};

export type DesiredBasePriceAndEntitlementPrices =
	BasePriceAndEntitlementPrices & {
		/** Slots the request stated as `null`, keyed by desired price id. */
		unlinkedStripeSlots: UnlinkedStripeSlotsByPriceId;
	};

/**
 * Mint desired base Price + EntitlementPrice rows from ProductItems.
 * Construction only — no claim/classification against current rows.
 */
export const productItemsToEntitlementPrices = ({
	items,
	product,
	features,
	stripeReusePrices,
}: {
	items: ProductItem[];
	/** Stamp only — org_id / internal_id. */
	product: Pick<Product, "org_id" | "internal_id">;
	features: Feature[];
	/** Current/candidate prices used only to refuse a mismatched stripe_price_id. */
	stripeReusePrices?: Price[];
}): DesiredBasePriceAndEntitlementPrices => {
	let basePrice: Price | undefined;
	const entitlementPrices: EntitlementPrice[] = [];
	const unlinkedStripeSlots: UnlinkedStripeSlotsByPriceId = {};
	const reusePrices = stripeReusePrices ?? [];

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
			...(reusePrices.length > 0
				? {
						stripeReusePrice: stripeReusePriceForItem({
							item,
							prices: reusePrices,
						}),
					}
				: {}),
		});

		if (newPrice) {
			const unlinked = unlinkedStripeSlotsForItem({ item });
			if (unlinked.length > 0) unlinkedStripeSlots[newPrice.id] = unlinked;
		}

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

	return { basePrice, entitlementPrices, unlinkedStripeSlots };
};
