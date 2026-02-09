/**
 * Calculate prorated amount for the remaining billing period.
 *
 * Uses Decimal.js for precision - no floating point errors.
 */

import { Decimal } from "decimal.js";
import {
	type BillingPeriod,
	type GetBillingPeriodParams,
	getBillingPeriod,
} from "./getBillingPeriod";

export type CalculateProrationParams = GetBillingPeriodParams & {
	advancedTo: number; // From initScenario - auto-floored to match Stripe
	amount: number; // Amount to prorate
};

/**
 * Calculate prorated amount for remaining billing period.
 *
 * Fetches billing period directly from Stripe subscription.
 *
 * Formula: (remaining time / total period) * amount
 *
 * Note: `advancedTo` is automatically floored to seconds to match Stripe's
 * frozen_time calculation (Stripe uses seconds, not milliseconds).
 *
 * @param customerId - The Autumn customer ID
 * @param advancedTo - The current time (from initScenario's advancedTo)
 * @param amount - The amount to prorate
 * @param interval - Optional: filter by billing interval ("month" or "year")
 *
 * @returns Prorated amount rounded to 2 decimal places
 *
 * @example
 * // Calculate prorated charge for remaining period
 * const prorated = await calculateProration({
 *   customerId,
 *   advancedTo,
 *   amount: 50, // Full price
 * });
 * // If 50% of period remaining, returns 25.00
 */
export const calculateProration = async ({
	customerId,
	advancedTo,
	amount,
	interval,
}: CalculateProrationParams): Promise<number> => {
	const { billingPeriod } = await getBillingPeriod({
		customerId,
		interval,
	});

	return calculateProrationFromPeriod({
		billingPeriod,
		advancedTo,
		amount,
	});
};

/**
 * Calculate prorated amount using a billing period directly.
 *
 * Useful when you already have the billing period and don't need to fetch
 * from Stripe.
 */
export const calculateProrationFromPeriod = ({
	billingPeriod,
	advancedTo,
	amount,
}: {
	billingPeriod: BillingPeriod;
	advancedTo: number;
	amount: number;
}): number => {
	// Floor to match Stripe's frozen_time calculation (seconds, not ms)
	const now = new Decimal(Math.floor(advancedTo / 1000) * 1000);

	const start = new Decimal(billingPeriod.start);
	const end = new Decimal(billingPeriod.end);

	// Proration formula: (remaining / total) * amount
	const remaining = end.minus(now);
	const total = end.minus(start);

	if (total.isZero()) {
		throw new Error(
			`Invalid billing period: start and end are the same (${billingPeriod.start})`,
		);
	}

	const ratio = remaining.div(total);
	const prorated = ratio.mul(amount);

	return prorated.toDecimalPlaces(2).toNumber();
};
