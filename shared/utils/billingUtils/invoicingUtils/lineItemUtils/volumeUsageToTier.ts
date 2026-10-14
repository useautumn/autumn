import { priceAmountsForCurrency } from "@models/productModels/priceModels/priceConfig/priceCurrencyView";
import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { isNotFinalTier } from "@utils/productUtils/priceUtils/classifyPriceUtils";
import { findTierByQuantity } from "@utils/productUtils/priceUtils/findTier/findTierByQuantity";
import { addAllowanceToTiers } from "@utils/productV2Utils/productItemUtils/tierUtils";

export const volumeUsageToTier = ({
	price,
	overage,
	allowance,
	currency,
}: {
	price: Price;
	overage: number;
	allowance: number;
	currency?: string;
}):
	| { billedUsage: number; billedTier: UsageTier; billedTierFirstUnit: number }
	| undefined => {
	const usageTiers =
		priceAmountsForCurrency({ config: price.config, currency }).usage_tiers ??
		price.config.usage_tiers;
	if (!usageTiers) return undefined;

	const billedUsage = roundUsageToNearestBillingUnit({
		usage: overage,
		billingUnits: price.config.billing_units ?? 1,
	});
	const tiers = addAllowanceToTiers({ tiers: usageTiers, allowance });
	const billedTier = findTierByQuantity({
		tiers,
		quantity: billedUsage + allowance,
	});
	if (!billedTier) return undefined;

	const previousTier = tiers[tiers.indexOf(billedTier) - 1];
	let billedTierFirstUnit = 1;
	if (previousTier && isNotFinalTier(previousTier)) {
		billedTierFirstUnit = previousTier.to + 1;
	}

	return { billedUsage, billedTier, billedTierFirstUnit };
};
