/**
 * Calculate prorated price difference for upgrades/downgrades.
 *
 * Common use case: mid-cycle upgrade from Pro ($20) to Premium ($50).
 * Returns the net charge: (prorated new) - (prorated old credit)
 *
 * Uses Decimal.js for precision - no floating point errors.
 */

import { Decimal } from "decimal.js";
import {
	type GetBillingPeriodParams,
	getBillingPeriod,
} from "./getBillingPeriod";

export type CalculateProratedDiffParams = GetBillingPeriodParams & {
	advancedTo: number; // From initScenario - auto-floored to match Stripe
	oldAmount: number; // Current/old price (will be credited)
	newAmount: number; // New price (will be charged)
};

/**
 * Calculate the prorated price difference for an upgrade or downgrade.
 *
 * Fetches billing period directly from Stripe subscription.
 *
 * Formula: (newAmount - oldAmount) * (remaining / total)
 *
 * This is equivalent to: proratedNew - proratedOld
 *
 * Works for:
 * - Base price changes (Pro $20 → Premium $50)
 * - Prepaid quantity changes (2 packs $20 → 3 packs $30)
 * - Allocated seat changes (5 seats $25 → 10 seats $50)
 *
 * Does NOT work for:
 * - Consumable/arrear charges (these are never prorated)
 *
 * @param customerId - The Autumn customer ID
 * @param advancedTo - The current time (from initScenario's advancedTo)
 * @param oldAmount - The old/current price (credited back)
 * @param newAmount - The new price (charged)
 * @param interval - Optional: filter by billing interval ("month" or "year")
 *
 * @returns Net charge amount (positive for upgrade, negative for downgrade)
 *
 * @example
 * // Mid-cycle upgrade: Pro $20 → Premium $50
 * const charge = await calculateProratedDiff({
 *   customerId,
 *   advancedTo,
 *   oldAmount: 20,
 *   newAmount: 50,
 * });
 * // If 50% of period remaining: (50 - 20) * 0.5 = $15
 *
 * @example
 * // Mid-cycle downgrade: Premium $50 → Pro $20
 * const credit = await calculateProratedDiff({
 *   customerId,
 *   advancedTo,
 *   oldAmount: 50,
 *   newAmount: 20,
 * });
 * // If 50% of period remaining: (20 - 50) * 0.5 = -$15 (credit)
 *
 * @example
 * // Prepaid upgrade: 2 packs → 3 packs mid-cycle
 * const charge = await calculateProratedDiff({
 *   customerId,
 *   advancedTo,
 *   oldAmount: 20, // 2 packs @ $10
 *   newAmount: 30, // 3 packs @ $10
 * });
 */
export const calculateProratedDiff = async ({
	customerId,
	advancedTo,
	oldAmount,
	newAmount,
	interval,
}: CalculateProratedDiffParams): Promise<number> => {
	const { billingPeriod } = await getBillingPeriod({
		customerId,
		interval,
	});

	// Floor to match Stripe's frozen_time calculation (seconds, not ms)
	const now = new Decimal(Math.floor(advancedTo / 1000) * 1000);

	const start = new Decimal(billingPeriod.start);
	const end = new Decimal(billingPeriod.end);

	// Proration ratio: remaining / total
	const remaining = end.minus(now);
	const total = end.minus(start);

	if (total.isZero()) {
		throw new Error(
			`Invalid billing period: start and end are the same (${billingPeriod.start})`,
		);
	}

	const ratio = remaining.div(total);

	// Net charge = (newAmount - oldAmount) * ratio
	const diff = new Decimal(newAmount).minus(oldAmount);
	const proratedDiff = diff.mul(ratio);

	return proratedDiff.toDecimalPlaces(2).toNumber();
};
