import type { TierLineBand } from "@models/billingModels/lineItem/tierLineBand";
import { priceAmountsForCurrency } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { graduatedTiersToLineBands } from "@utils/billingUtils/invoicingUtils/lineItemUtils/graduatedTiersToLineBands";
import { volumeTiersToLineBands } from "@utils/billingUtils/invoicingUtils/lineItemUtils/volumeTiersToLineBands";

/**
 * The charges a tiered price bills for a non-negative quantity, one per tier band.
 * `tiersToLineAmount` is their sum, so lines and totals can't drift.
 */
export const tiersToLineBands = ({
	price,
	overage,
	allowance = 0,
	billingUnits = price.config.billing_units ?? 1,
	currency,
}: {
	price: Price;
	overage: number;
	allowance?: number;
	billingUnits?: number;
	currency?: string;
}): TierLineBand[] => {
	const tiers =
		priceAmountsForCurrency({ config: price.config, currency }).usage_tiers ??
		price.config.usage_tiers;
	if (!tiers) return [];

	const isVolume = price.tier_behavior === TierBehavior.VolumeBased;

	if (isVolume) {
		return volumeTiersToLineBands({
			tiers,
			usage: overage,
			allowance,
			billingUnits,
		});
	}

	return graduatedTiersToLineBands({
		tiers,
		usage: overage,
		allowance,
		billingUnits,
	});
};
