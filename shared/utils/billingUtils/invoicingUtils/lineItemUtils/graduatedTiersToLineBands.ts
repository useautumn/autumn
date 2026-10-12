import type { TierLineBand } from "@models/billingModels/lineItem/tierLineBand";
import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { isFinalTier } from "@utils/productUtils/priceUtils/classifyPriceUtils";
import { Decimal } from "decimal.js";

/**
 * Splits non-negative usage across graduated bands, each at its own rate.
 * Stored tiers are net of included usage, so `allowance` only shifts the band positions.
 */
export const graduatedTiersToLineBands = ({
	tiers,
	usage,
	allowance = 0,
	billingUnits = 1,
}: {
	tiers: UsageTier[];
	usage: number;
	allowance?: number;
	billingUnits?: number;
}): TierLineBand[] => {
	const roundedUsage = roundUsageToNearestBillingUnit({ usage, billingUnits });

	const bands: TierLineBand[] = [];
	let remaining = new Decimal(roundedUsage);
	let lastTierTo = new Decimal(0);

	for (const tier of tiers) {
		if (remaining.lte(0)) break;

		const isFinal = isFinalTier(tier);
		const tierSize = isFinal
			? remaining
			: Decimal.min(remaining, new Decimal(tier.to).minus(lastTierTo));

		const rate = new Decimal(tier.amount).div(billingUnits);
		bands.push({
			kind: "usage",
			tierStart: lastTierTo.plus(allowance).toNumber(),
			tierEnd: isFinal ? null : new Decimal(tier.to).plus(allowance).toNumber(),
			quantity: tierSize.toNumber(),
			unitAmount: tier.amount,
			amount: rate.mul(tierSize).toNumber(),
		});

		remaining = remaining.minus(tierSize);
		if (!isFinal) lastTierTo = new Decimal(tier.to);
	}

	return bands;
};
