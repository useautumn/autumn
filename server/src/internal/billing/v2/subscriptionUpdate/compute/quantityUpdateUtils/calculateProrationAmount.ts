import type { extractBillingPeriod } from "@autumn/shared";
import {
	applyProration,
	type FeatureOptions,
	priceToLineAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { calculateQuantityDifferences } from "./calculateQuantityDifferences";
import type { resolvePriceForQuantityUpdate } from "./resolvePriceForQuantityUpdate";

/**
 * Calculates the prorated amount to charge or credit for a quantity change.
 *
 * Applies time-based proration: (new_price - old_price) × (time_remaining / total_period).
 * Returns undefined if proration is disabled or subscription is trialing.
 *
 * @param previousOptions - Current feature options with old quantity
 * @param updatedOptions - Desired feature options with new quantity
 * @param priceConfiguration - Price config including proration rules and billing units
 * @param quantityDifferences - Quantity change details including upgrade/downgrade indicator
 * @param stripeSubscription - Active Stripe subscription (for trial status)
 * @param billingPeriod - Current billing period boundaries
 * @param currentEpochMs - Current timestamp in milliseconds
 * @returns Prorated amount in dollars, or undefined if proration doesn't apply
 */
export const calculateProrationAmount = ({
	previousOptions,
	updatedOptions,
	priceConfiguration,
	quantityDifferences,
	stripeSubscription,
	billingPeriod,
	currentEpochMs,
}: {
	previousOptions: FeatureOptions;
	updatedOptions: FeatureOptions;
	priceConfiguration: ReturnType<typeof resolvePriceForQuantityUpdate>;
	quantityDifferences: ReturnType<typeof calculateQuantityDifferences>;
	stripeSubscription: Stripe.Subscription;
	billingPeriod: ReturnType<typeof extractBillingPeriod>;
	currentEpochMs: number;
}): number | undefined => {
	const { price, billingUnitsPerQuantity, shouldApplyProration } =
		priceConfiguration;
	const { isUpgrade } = quantityDifferences;
	const isTrialing = stripeSubscription.status === "trialing";

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
			start: billingPeriod.subscriptionPeriodStartEpochMs,
			end: billingPeriod.subscriptionPeriodEndEpochMs,
		},
		amount: amountDifferenceDollars.toNumber(),
	});

	if (proratedAmountDollars <= 0 && isUpgrade) {
		return 0;
	}

	return proratedAmountDollars;
};
