import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { Infinite } from "@models/productModels/productEnums";
import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { addAllowanceToTiers } from "@utils/productV2Utils/productItemUtils/tierUtils";
import { nullish } from "@utils/utils";
import { Decimal } from "decimal.js";

export const volumeTiersToLineAmount = ({
	tiers,
	usage,
	allowance = 0,
	billingUnits = 1,
	allowNegative = false,
}: {
	tiers: UsageTier[];
	usage: number;
	allowance?: number;
	billingUnits?: number;
	allowNegative?: boolean;
}): number => {
	if (nullish(tiers)) {
		throw new Error(
			"[volumeTiersToLineAmount] usage_tiers required for volume-based prices",
		);
	}

	const isNegative = allowNegative && usage < 0;
	const absoluteUsage = allowNegative ? Math.abs(usage) : Math.max(0, usage);

	const roundedUsage = roundUsageToNearestBillingUnit({
		usage: absoluteUsage,
		billingUnits,
	});

	let amount = new Decimal(0);

	const tiersWithAllowance = addAllowanceToTiers({
		tiers,
		allowance,
	});

	for (const tier of tiersWithAllowance) {
		const isFinalTier = tier.to === Infinite || tier.to === -1;
		const tierBoundary = isFinalTier ? Infinity : (tier.to as number);

		if (roundedUsage <= tierBoundary) {
			const rate = new Decimal(tier.amount).div(billingUnits);
			amount = rate.mul(roundedUsage);
			if (tier.flat_amount) {
				amount = amount.plus(tier.flat_amount);
			}
			break;
		}
	}

	const finalAmount = amount.toDecimalPlaces(10).toNumber();
	return isNegative ? -finalAmount : finalAmount;
};
