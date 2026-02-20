import { Decimal } from "decimal.js";
import type { UsageTier } from "../../../../models/productModels/priceModels/priceConfig/usagePriceConfig";
import { Infinite } from "../../../../models/productModels/productEnums";
import { nullish } from "../../../utils";
import { roundUsageToNearestBillingUnit } from "../../usageUtils/roundUsageToNearestBillingUnit";

/**
 * Core graduated tiered pricing calculation.
 * Walks usage_tiers, accumulating cost per tier band.
 */
export const calculateGraduatedTiersAmount = ({
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
			"[calculateGraduatedTiersAmount] usage_tiers required for usage-based prices",
		);
	}

	const isNegative = allowNegative && usage < 0;
	const absoluteUsage = allowNegative ? Math.abs(usage) : usage;

	const roundedUsage = roundUsageToNearestBillingUnit({
		usage: absoluteUsage,
		billingUnits,
	});

	let amount = new Decimal(0);
	let remaining = new Decimal(roundedUsage);
	let lastTierTo = 0;

	for (const tier of tiers) {
		if (remaining.lte(0)) break;

		const isFinalTier = tier.to === Infinite || tier.to === -1;

		const tierSize = isFinalTier
			? remaining
			: Decimal.min(remaining, new Decimal(tier.to).minus(lastTierTo));

		const rate = new Decimal(tier.amount).div(billingUnits);
		amount = amount.plus(rate.mul(tierSize));
		remaining = remaining.minus(tierSize);

		if (!isFinalTier) {
			lastTierTo = tier.to as number;
		}
	}

	const finalAmount = amount.toDecimalPlaces(10).toNumber();
	return isNegative ? -finalAmount : finalAmount;
};
