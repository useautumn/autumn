import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { volumeTiersToLineBands } from "@utils/billingUtils/invoicingUtils/lineItemUtils/volumeTiersToLineBands";
import { nullish } from "@utils/utils";
import { Decimal } from "decimal.js";

/**
 * Volume-based tier pricing: the ENTIRE usage is charged at the rate of
 * whichever single tier it falls into (unlike graduated, which splits across bands).
 *
 * When `allowance` > 0, a free $0 tier is prepended and paid-tier boundaries
 * are shifted up. If usage <= allowance, cost is $0. If usage exceeds the
 * allowance, the ENTIRE usage (including the free portion) is charged at the
 * matching paid tier's rate. This is intentional — volume pricing does not
 * subtract included usage before applying the rate.
 */
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

	const amount = volumeTiersToLineBands({
		tiers,
		usage: absoluteUsage,
		allowance,
		billingUnits,
	}).reduce((sum, band) => sum.plus(band.amount), new Decimal(0));

	const finalAmount = amount.toDecimalPlaces(10).toNumber();
	return isNegative ? -finalAmount : finalAmount;
};
