import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels.js";
import type { Price } from "@models/productModels/priceModels/priceModels.js";
import { entToPrice } from "../../convertProductUtils.js";
import { entWithDerivedCarryFromPrevious } from "../../entUtils/convertEnt/entWithDerivedCarryFromPrevious.js";
import { isFixedPrice } from "../../priceUtils/classifyPriceUtils.js";
import type { BasePriceAndEntitlementPrices } from "../entitlementPriceTypes.js";

/** Split a flat price + entitlement bag into basePrice + entitlementPrices. */
export const pricesAndEntitlementsToBasePriceAndEntitlementPrices = ({
	prices,
	entitlements,
}: {
	prices: Price[];
	entitlements: EntitlementWithFeature[];
}): BasePriceAndEntitlementPrices => ({
	basePrice: prices.find(isFixedPrice) ?? undefined,
	entitlementPrices: entitlements.map((entitlement) => ({
		entitlement: entWithDerivedCarryFromPrevious(entitlement),
		price: entToPrice({ ent: entitlement, prices }),
	})),
});
