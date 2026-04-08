/**
 * Calculate prorated amount for the remaining billing period.
 *
 * Uses Decimal.js for precision - no floating point errors.
 */

import { addMonths } from "date-fns";
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

export type CalculateResetBillingCycleNowTotalParams =
	GetBillingPeriodParams & {
		advancedTo: number;
		oldAmount: number;
		newAmount: number;
	};

export type CalculateBillingCycleAnchorResetNextCycleParams =
	GetBillingPeriodParams & {
		billingCycleAnchorMs: number;
		nextCycleAmount: number;
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
 * Calculate the immediate invoice total for `billing_cycle_anchor: "now"`.
 *
 * Stripe charges the full new amount for the reset period, then applies a
 * prorated credit for the unused portion of the old period.
 */
export const calculateResetBillingCycleNowTotal = async ({
	customerId,
	advancedTo,
	oldAmount,
	newAmount,
	interval,
}: CalculateResetBillingCycleNowTotalParams): Promise<number> => {
	const proratedCredit = await calculateProration({
		customerId,
		advancedTo,
		amount: oldAmount,
		interval,
	});

	return new Decimal(newAmount)
		.minus(proratedCredit)
		.toDecimalPlaces(2)
		.toNumber();
};

const floorToStripeSecond = (timestampMs: number) =>
	Math.floor(timestampMs / 1000) * 1000;

/**
 * Calculate the first future invoice surfaced in preview for a scheduled
 * billing cycle anchor reset.
 *
 * When the anchor is before the current period end, Stripe's `always_invoice`
 * bills for the "extra" days in the NEW cycle that extend beyond the original
 * period end.
 *
 * Example: original cycle 1 Mar -> 1 Apr, anchor resets on 10 Mar.
 *   New cycle: 10 Mar -> 10 Apr.
 *   Credit for unused: 10 Mar -> 1 Apr.
 *   Charge for new period: 10 Mar -> 10 Apr.
 *   Net = extra days = 1 Apr -> 10 Apr, prorated against the new period.
 *   Total = amount * (newCycleEnd - originalPeriodEnd) / (newCycleEnd - anchor)
 */
export const calculateBillingCycleAnchorResetNextCycle = async ({
	customerId,
	billingCycleAnchorMs,
	nextCycleAmount,
	interval,
}: CalculateBillingCycleAnchorResetNextCycleParams): Promise<{
	startsAt: number;
	total: number;
}> => {
	const { billingPeriod } = await getBillingPeriod({
		customerId,
		interval,
	});

	const normalizedAnchorMs = floorToStripeSecond(billingCycleAnchorMs);

	if (normalizedAnchorMs < billingPeriod.end) {
		const newCycleEndMs = addMonths(normalizedAnchorMs, 1).getTime();
		const originalPeriodEndMs = floorToStripeSecond(billingPeriod.end);

		const extraDays = new Decimal(newCycleEndMs - originalPeriodEndMs);
		const newPeriodLength = new Decimal(newCycleEndMs - normalizedAnchorMs);

		return {
			startsAt: normalizedAnchorMs,
			total: new Decimal(nextCycleAmount)
				.mul(extraDays.div(newPeriodLength))
				.toDecimalPlaces(2)
				.toNumber(),
		};
	}

	return {
		startsAt: billingPeriod.end,
		total: nextCycleAmount,
	};
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
	const now = new Decimal(floorToStripeSecond(advancedTo));

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
