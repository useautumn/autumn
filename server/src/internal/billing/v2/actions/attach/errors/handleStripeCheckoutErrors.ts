import {
	type AttachBillingContext,
	type AutumnBillingPlan,
	BillingInterval,
	ErrCode,
	RecaseError,
} from "@autumn/shared";

/**
 * Gets unique recurring intervals from line items (excludes one-off prices).
 */
const getRecurringIntervalsFromPaidLineItems = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): Set<string> => {
	const intervals = new Set<string>();

	for (const lineItem of autumnBillingPlan.lineItems ?? []) {
		const price = lineItem.context.price;
		const interval = price.config.interval;

		// Skip one-off prices
		if (interval === BillingInterval.OneOff) continue;
		if (lineItem.amountAfterDiscounts <= 0) continue;

		// Create a unique key for interval + interval_count
		const intervalCount = price.config.interval_count ?? 1;
		const key = `${interval}_${intervalCount}`;
		intervals.add(key);
	}

	return intervals;
};

/**
 * Validates that stripe checkout mode doesn't have multiple recurring intervals.
 *
 * Stripe checkout sessions can only handle one recurring interval at a time.
 * If we have line items with different intervals (e.g., monthly and annual),
 * we cannot create a valid checkout session.
 */
export const handleStripeCheckoutErrors = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	// Only check for stripe_checkout mode
	if (billingContext.checkoutMode !== "stripe_checkout") return;

	const recurringIntervals = getRecurringIntervalsFromPaidLineItems({
		autumnBillingPlan,
	});

	// If we have more than one unique recurring interval, throw an error
	if (recurringIntervals.size > 1) {
		throw new RecaseError({
			message:
				"Cannot create Stripe checkout when there are multiple intervals that require payment upfront. Please use direct billing or separate the purchases.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// enable_plan_immediately pre-inserts the cusProduct (with its feature
	// quantities) at attach time. If the customer can change quantities on the
	// Stripe checkout page, those changes won't propagate back to the row,
	// leaving Autumn out of sync with Stripe. Block the combination explicitly.
	if (
		billingContext.enablePlanImmediately &&
		(billingContext.adjustableFeatureQuantities?.length ?? 0) > 0
	) {
		throw new RecaseError({
			message:
				"enable_plan_immediately cannot be used with adjustable feature quantities — set adjustable_quantity to false on each option, or remove enable_plan_immediately.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
