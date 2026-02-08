/**
 * Calculate total charge for cross-interval upgrades (e.g., monthly → annual).
 *
 * When upgrading from monthly to annual mid-cycle:
 * 1. Credit for remaining monthly period
 * 2. Prorated annual charge (from now until 1 year from billing anchor)
 *
 * Uses Decimal.js for precision.
 */

import { addInterval, BillingInterval } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { getBillingPeriod } from "./getBillingPeriod";

export type CalculateCrossIntervalUpgradeParams = {
	customerId: string;
	advancedTo: number; // From initScenario
	oldAmount?: number; // Current subscription price (e.g., $20/month). Optional - defaults to 0 (no credit)
	newAmount: number; // New subscription price (e.g., $200/year)
	oldInterval?: "month" | "year"; // Current interval (default: "month")
};

/**
 * Calculate total charge for upgrading from one billing interval to another.
 *
 * @param customerId - The Autumn customer ID
 * @param advancedTo - The current time (from initScenario's advancedTo)
 * @param oldAmount - The old subscription price (will be credited for remaining period)
 * @param newAmount - The new subscription price (prorated from now to anchor + 1 year)
 * @param oldInterval - The current billing interval (default: "month")
 *
 * @returns Total charge (prorated new - credit for remaining old)
 *
 * @example
 * // Monthly $20 → Annual $200, mid-cycle (1.5 months in)
 * const charge = await calculateCrossIntervalUpgrade({
 *   customerId,
 *   advancedTo,
 *   oldAmount: 20,   // Monthly price
 *   newAmount: 200,  // Annual price
 * });
 * // Returns: prorated annual (~$175) - remaining monthly credit (~$10) = ~$165
 */
export const calculateCrossIntervalUpgrade = async ({
	customerId,
	advancedTo,
	oldAmount = 0,
	newAmount,
	oldInterval = "month",
}: CalculateCrossIntervalUpgradeParams): Promise<number> => {
	const { billingPeriod, billingAnchorMs } = await getBillingPeriod({
		customerId,
		interval: oldInterval,
	});

	// Floor to match Stripe's frozen_time calculation (seconds, not ms)
	const now = new Decimal(Math.floor(advancedTo / 1000) * 1000);

	const periodStart = new Decimal(billingPeriod.start);
	const periodEnd = new Decimal(billingPeriod.end);

	// 1. Calculate credit for remaining old period
	const oldRemaining = periodEnd.minus(now);
	const oldTotal = periodEnd.minus(periodStart);
	const oldRatio = oldRemaining.div(oldTotal);
	const oldCredit = oldRatio.mul(oldAmount);

	// 2. Calculate prorated new (annual) charge
	// Annual period: billing anchor → 1 calendar year from billing anchor
	const annualPeriodEndMs = addInterval({
		from: billingAnchorMs,
		interval: BillingInterval.Year,
	});
	const annualPeriodEnd = new Decimal(annualPeriodEndMs);
	const annualTotal = annualPeriodEnd.minus(new Decimal(billingAnchorMs));
	const annualRemaining = annualPeriodEnd.minus(now);
	const annualRatio = annualRemaining.div(annualTotal);
	const annualCharge = annualRatio.mul(newAmount);

	// Total = prorated annual - credit for remaining monthly
	const total = annualCharge.minus(oldCredit);

	return total.toDecimalPlaces(2).toNumber();
};
