import { priceAmountsForCurrency } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { findTierByQuantity } from "@utils/productUtils/priceUtils/findTier/findTierByQuantity";
import { addAllowanceToTiers } from "@utils/productV2Utils/productItemUtils/tierUtils";

/** The one tier a volume price bills total usage at, in total-usage positions. */
export const volumeUsageToTier = ({
	price,
	quantity,
	allowance,
	currency,
}: {
	price: Price;
	quantity: number;
	allowance: number;
	currency?: string;
}): { quantity: number; tiers: UsageTier[]; tier: UsageTier } | undefined => {
	const usageTiers =
		priceAmountsForCurrency({ config: price.config, currency }).usage_tiers ??
		price.config.usage_tiers;
	if (!usageTiers) return undefined;

	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: quantity,
		billingUnits: price.config.billing_units ?? 1,
	});
	const tiers = addAllowanceToTiers({ tiers: usageTiers, allowance });
	const tier = findTierByQuantity({ tiers, quantity: roundedQuantity });
	if (!tier) return undefined;

	return { quantity: roundedQuantity, tiers, tier };
};
