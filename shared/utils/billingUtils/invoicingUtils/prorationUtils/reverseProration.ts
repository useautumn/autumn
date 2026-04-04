import { Decimal } from "decimal.js";
import type { BillingPeriod } from "../../../../models/billingModels/lineItem/lineItemContext";

/**
 * Reverses proration to recover the full-period amount from a prorated amount.
 *
 * Inverse of `applyProration`:
 *   prorated = (end - now) / (end - start) * full
 *   full     = prorated * (end - start) / (end - now)
 */
export const reverseProration = ({
	now,
	billingPeriod,
	proratedAmount,
}: {
	now: number;
	billingPeriod: BillingPeriod;
	proratedAmount: number;
}): number => {
	const { start, end } = billingPeriod;

	const total = new Decimal(end).minus(start);
	const remaining = new Decimal(end).minus(now);

	if (remaining.isZero()) return proratedAmount;

	return new Decimal(proratedAmount).mul(total).div(remaining).toNumber();
};
