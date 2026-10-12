import { Decimal } from "decimal.js";
import type { UsageTier } from "../../../../models/productModels/priceModels/priceConfig/usagePriceConfig";
import { nullish } from "../../../utils";
import { graduatedTiersToLineBands } from "./graduatedTiersToLineBands";

/**
 * Core graduated tiered pricing calculation used across all billing contexts:
 * included usage (free allowances), prepaid purchased quantities, and paid overage.
 *
 * Graduated pricing splits usage across tier bands — each band is charged at
 * its own rate. For example, if tier 1 covers 0–100 units at $1 and tier 2
 * covers 100+ at $0.50, then 150 units costs (100 × $1) + (50 × $0.50) = $125.
 *
 * - **Included usage** (free allowance): pass `usage = includedQuantity`. The
 *   result represents the monetary value of the free bucket — used to compute
 *   how much of the prepaid charge is "used up" vs remaining.
 * - **Prepaid quantity** (usage_in_advance): pass `usage = quantityPurchased`.
 *   The result is what the customer is charged upfront for the units they bought.
 * - **Paid overage** (usage_in_arrear / pay-per-use): pass `usage = overageUnits`
 *   (raw usage minus any included or prepaid allowance). The result is the
 *   end-of-period charge for units consumed beyond the free/prepaid bucket.
 *
 * @param tiers - Ordered array of tier bands from the price config (`usage_tiers`).
 * @param usage - The quantity to price. Meaning depends on context: purchased
 *   quantity for prepaid, overage units for arrear billing, or free-bucket size
 *   for included-usage valuation. Must be non-negative unless `allowNegative` is true.
 * @param billingUnits - Divisor applied before multiplying by tier rate (e.g. 1000
 *   for "per 1k tokens"). Defaults to 1.
 * @param allowNegative - When true, a negative `usage` is priced on its absolute
 *   value and the result is negated. Used for downgrade credits / proration refunds.
 *   Defaults to false.
 * @returns The total dollar amount as a number rounded to 10 decimal places.
 */
export const graduatedTiersToLineAmount = ({
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
			"[graduatedTiersToLineAmount] usage_tiers required for usage-based prices",
		);
	}

	const isNegative = allowNegative && usage < 0;
	const absoluteUsage = allowNegative ? Math.abs(usage) : usage;

	const amount = graduatedTiersToLineBands({
		tiers,
		usage: absoluteUsage,
		billingUnits,
	}).reduce((sum, band) => sum.plus(band.amount), new Decimal(0));

	const finalAmount = amount.toDecimalPlaces(10).toNumber();
	return isNegative ? -finalAmount : finalAmount;
};
