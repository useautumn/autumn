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
const getRecurringIntervalsFromLineItems = ({
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

	const recurringIntervals = getRecurringIntervalsFromLineItems({
		autumnBillingPlan,
	});

	console.log("recurringIntervals", recurringIntervals);

	// If we have more than one unique recurring interval, throw an error
	if (recurringIntervals.size > 1) {
		throw new RecaseError({
			message:
				"Cannot create Stripe checkout when there are multiple intervals that require payment upfront. Please use direct billing or separate the purchases.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
