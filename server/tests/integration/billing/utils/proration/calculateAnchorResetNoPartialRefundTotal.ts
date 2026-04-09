/**
 * Calculate the expected invoice total for `billing_cycle_anchor: "now"` +
 * `proration_behavior: "none"` with full-period-only refunds.
 *
 * Fetches the billing period from Stripe and computes:
 * - Charge: full newAmount (no proration on the incoming plan)
 * - Refund: time-based prorated credit from the snapped cycle boundary to period end
 *
 * For same-interval (monthly -> monthly), there are 0 full months remaining
 * mid-cycle, so refund = 0 and total = newAmount.
 *
 * For cross-interval (annual -> monthly with monthly entitlements), the refund
 * covers the time-proportional amount from the next cycle boundary to period end.
 */

import { type EntInterval, getCycleEnd, getCycleStart } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { calculateProrationFromPeriod } from "./calculateProration";
import { getBillingPeriod } from "./getBillingPeriod";

const floorToStripeSecond = (timestampMs: number) =>
	Math.floor(timestampMs / 1000) * 1000;

export const calculateAnchorResetNoPartialRefundTotal = async ({
	customerId,
	advancedTo,
	oldAmount,
	newAmount,
	refundCycleInterval,
	refundCycleIntervalCount = 1,
	interval,
}: {
	customerId: string;
	advancedTo: number;
	oldAmount: number;
	newAmount: number;
	refundCycleInterval: EntInterval;
	refundCycleIntervalCount?: number;
	interval?: "month" | "year";
}): Promise<{ total: number; refund: number }> => {
	const { billingPeriod } = await getBillingPeriod({
		customerId,
		interval,
	});

	const now = floorToStripeSecond(advancedTo);

	const cycleStart = getCycleStart({
		anchor: billingPeriod.start,
		interval: refundCycleInterval,
		intervalCount: refundCycleIntervalCount,
		now,
	});

	const snappedNow =
		cycleStart === now
			? now
			: getCycleEnd({
					anchor: billingPeriod.start,
					interval: refundCycleInterval,
					intervalCount: refundCycleIntervalCount,
					now,
				});

	if (snappedNow >= billingPeriod.end) {
		return { total: newAmount, refund: 0 };
	}

	const refund = calculateProrationFromPeriod({
		billingPeriod,
		advancedTo: snappedNow,
		amount: oldAmount,
	});

	const total = new Decimal(newAmount)
		.minus(refund)
		.toDecimalPlaces(2)
		.toNumber();

	return { total, refund };
};
