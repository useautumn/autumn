import {
	applyProration,
	type BillingPeriod,
	type FeatureOptions,
	priceToLineAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { UpdateSubscriptionBillingContext } from "../../../billingContext";
import type { calculateQuantityDifferences } from "./calculateQuantityDifferences";
import type { resolvePriceForQuantityUpdate } from "./resolvePriceForQuantityUpdate";

/**
 * Calculates the prorated amount to charge or credit for a quantity change.
 *
 * Applies time-based proration: (new_price - old_price) × (time_remaining / total_period).
 * Returns undefined if proration is disabled or subscription is trialing.
 *
 * @param updateSubscriptionContext - Update subscription context
 * @param previousOptions - Current feature options with old quantity
 * @param updatedOptions - Desired feature options with new quantity
 * @param priceConfiguration - Price config including proration rules and billing units
 * @param quantityDifferences - Quantity change details including upgrade/downgrade indicator
 * @param billingPeriod - Current billing period boundaries
 * @returns Prorated amount in dollars, or undefined if proration doesn't apply
 */
export const calculateProrationAmount = ({
	updateSubscriptionContext,
	previousOptions,
	updatedOptions,
	priceConfiguration,
	quantityDifferences,
	billingPeriod,
}: {
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	previousOptions: FeatureOptions;
	updatedOptions: FeatureOptions;
	priceConfiguration: ReturnType<typeof resolvePriceForQuantityUpdate>;
	quantityDifferences: ReturnType<typeof calculateQuantityDifferences>;
	billingPeriod: BillingPeriod;
}): number | undefined => {
	const { stripeSubscription, currentEpochMs } = updateSubscriptionContext;
	const { price, billingUnitsPerQuantity } = priceConfiguration;
	const { isUpgrade } = quantityDifferences;

	if (!stripeSubscription) {
		return undefined;
	}

	const isTrialing = stripeSubscription.status === "trialing";

	if (isTrialing) {
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
		billingPeriod,
		amount: amountDifferenceDollars.toNumber(),
	});

	if (proratedAmountDollars <= 0 && isUpgrade) {
		return 0;
	}

	return proratedAmountDollars;
};
