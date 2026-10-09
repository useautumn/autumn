import type { TierLineBand } from "@models/billingModels/lineItem/tierLineBand";
import { priceAmountsForCurrency } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { graduatedTiersToLineBands } from "@utils/billingUtils/invoicingUtils/lineItemUtils/graduatedTiersToLineBands";
import { volumeTiersToLineBands } from "@utils/billingUtils/invoicingUtils/lineItemUtils/volumeTiersToLineBands";

/**
 * The charges behind `tiersToLineAmount` for a non-negative quantity, one per tier band.
 * Takes the same `overage` and `allowance` as `tiersToLineAmount`, so the bands sum to it.
 */
export const tiersToLineBands = ({
	price,
	overage,
	allowance = 0,
	currency,
}: {
	price: Price;
	overage: number;
	allowance?: number;
	currency?: string;
}): TierLineBand[] => {
	const tiers =
		priceAmountsForCurrency({ config: price.config, currency }).usage_tiers ??
		price.config.usage_tiers;
	if (!tiers) return [];

	const billingUnits = price.config.billing_units ?? 1;
	const isVolume = price.tier_behavior === TierBehavior.VolumeBased;

	return isVolume
		? volumeTiersToLineBands({
				tiers,
				usage: overage,
				allowance,
				billingUnits,
			})
		: graduatedTiersToLineBands({
				tiers,
				usage: overage,
				allowance,
				billingUnits,
			});
};
