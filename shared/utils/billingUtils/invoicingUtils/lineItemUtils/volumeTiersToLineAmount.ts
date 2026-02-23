import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { Infinite } from "@models/productModels/productEnums";
import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { nullish } from "@utils/utils";
import Decimal from "decimal.js";

export const volumeTiersToLineAmount = ({
	tiers,
	usage,
	billingUnits = 1,
	allowNegative = false,
}: {
	tiers: UsageTier[];
	usage: number;
	billingUnits?: number;
	allowNegative?: boolean;
}): number => {
	if (nullish(tiers)) {
		throw new Error(
			"[volumeTiersToLineAmount] usage_tiers required for volume-based prices",
		);
	}

	const isNegative = allowNegative && usage < 0;
	const absoluteUsage = allowNegative ? Math.abs(usage) : usage;

	const roundedUsage = roundUsageToNearestBillingUnit({
		usage: absoluteUsage,
		billingUnits,
	});

	let amount = new Decimal(0);

	// for each tier
	// if the usage is less than the tier.to,
	// add the tier.amount * usage to the amount
	// then break
	// else keep going.
	for (const tier of tiers) {
		const isFinalTier = tier.to === Infinite || tier.to === -1;
		const tierBoundary = isFinalTier ? Infinity : (tier.to as number);

		// If the usage is within this current tier,
		if (roundedUsage <= tierBoundary) {
			// Assume the total amount is THIS tier's cost * the usage
			const rate = new Decimal(tier.amount).div(billingUnits);
			amount = rate.mul(roundedUsage);
			// Do not consider each tier individually, just use the total amount for this tier.
			break;
		}
	}

	const finalAmount = amount.toDecimalPlaces(10).toNumber();
	return isNegative ? -finalAmount : finalAmount;
};
