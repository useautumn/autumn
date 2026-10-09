import type { TierLineBand } from "@models/billingModels/lineItem/tierLineBand";
import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { Infinite } from "@models/productModels/productEnums";
import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { addAllowanceToTiers } from "@utils/productV2Utils/productItemUtils/tierUtils";
import { Decimal } from "decimal.js";

/**
 * Prices all non-negative usage at the one tier it lands in, plus that tier's flat fee.
 * `allowance` prepends a free tier, so past it the included units are charged too.
 */
export const volumeTiersToLineBands = ({
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
	const tiersWithAllowance = addAllowanceToTiers({ tiers, allowance });

	let tierStart = 0;
	for (const tier of tiersWithAllowance) {
		const isFinalTier = tier.to === Infinite || tier.to === -1;
		const tierEnd = isFinalTier ? null : (tier.to as number);

		if (tierEnd !== null && roundedUsage > tierEnd) {
			tierStart = tierEnd;
			continue;
		}

		const rate = new Decimal(tier.amount).div(billingUnits);
		const usageBand: TierLineBand = {
			kind: "usage",
			tierStart,
			tierEnd,
			quantity: roundedUsage,
			unitAmount: tier.amount,
			amount: rate.mul(roundedUsage).toNumber(),
		};
		if (!tier.flat_amount) return [usageBand];

		return [
			usageBand,
			{
				kind: "flat_fee",
				tierStart,
				tierEnd,
				quantity: 1,
				unitAmount: tier.flat_amount,
				amount: tier.flat_amount,
			},
		];
	}

	return [];
};
