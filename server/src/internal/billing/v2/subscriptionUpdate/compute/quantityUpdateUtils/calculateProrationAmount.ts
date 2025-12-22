import {
	applyProration,
	type FeatureOptions,
	type Price,
	priceToLineAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

/**
 * Calculates the prorated amount to charge or credit for a quantity change.
 *
 * Applies time-based proration: (new_price - old_price) × (time_remaining / total_period).
 * Returns undefined if proration is disabled or subscription is trialing.
 *
 * @param previousOptions - Current feature options with old quantity
 * @param updatedOptions - Desired feature options with new quantity
 * @param price - Price configuration for this feature
 * @param billingUnitsPerQuantity - Multiplier for converting quantities to billing units
 * @param shouldApplyProration - Whether proration is enabled for this change
 * @param isTrialing - Whether subscription is in trial period
 * @param isUpgrade - Whether quantity is increasing
 * @param currentEpochMs - Current timestamp in milliseconds
 * @param billingPeriod - Current billing period boundaries
 * @returns Prorated amount in dollars, or undefined if proration doesn't apply
 */
export const calculateProrationAmount = ({
	previousOptions,
	updatedOptions,
	price,
	billingUnitsPerQuantity,
	shouldApplyProration,
	isTrialing,
	isUpgrade,
	currentEpochMs,
	billingPeriod,
}: {
	previousOptions: FeatureOptions;
	updatedOptions: FeatureOptions;
	price: Price;
	billingUnitsPerQuantity: number;
	shouldApplyProration: boolean;
	isTrialing: boolean;
	isUpgrade: boolean;
	currentEpochMs: number;
	billingPeriod: { start: number; end: number };
}): number | undefined => {
	if (!shouldApplyProration || isTrialing) {
		return undefined;
	}

	const previousQuantityActual = new Decimal(previousOptions.quantity)
		.mul(billingUnitsPerQuantity)
		.toNumber();
	const updatedQuantityActual = new Decimal(updatedOptions.quantity)
		.mul(billingUnitsPerQuantity)
		.toNumber();

	const previousAmountDollars = priceToLineAmount({
		price,
		overage: previousQuantityActual,
	});

	const updatedAmountDollars = priceToLineAmount({
		price,
		overage: updatedQuantityActual,
	});

	const amountDifferenceDollars = new Decimal(updatedAmountDollars).minus(
		previousAmountDollars,
	);

	const proratedAmountDollars = applyProration({
		now: currentEpochMs,
		billingPeriod: {
			start: billingPeriod.start,
			end: billingPeriod.end,
		},
		amount: amountDifferenceDollars.toNumber(),
	});

	if (proratedAmountDollars <= 0 && isUpgrade) {
		return 0;
	}

	return proratedAmountDollars;
};
