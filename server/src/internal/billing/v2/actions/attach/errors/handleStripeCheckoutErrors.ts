import {
	type AttachBillingContext,
	type AutumnBillingPlan,
	BillingInterval,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { handleStripeCheckoutLicenseErrors } from "./handleLicenseErrors/handleStripeCheckoutLicenseErrors";

const getRecurringIntervalsFromPaidLineItems = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): Set<string> => {
	const intervals = new Set<string>();

	for (const lineItem of autumnBillingPlan.lineItems ?? []) {
		const price = lineItem.context.price;
		const interval = price.config.interval;

		if (interval === BillingInterval.OneOff) continue;
		if (lineItem.amountAfterDiscounts <= 0) continue;

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
	if (billingContext.checkoutMode !== "stripe_checkout") return;

	handleStripeCheckoutLicenseErrors({ billingContext, autumnBillingPlan });

	const recurringIntervals = getRecurringIntervalsFromPaidLineItems({
		autumnBillingPlan,
	});

	if (recurringIntervals.size > 1) {
		throw new RecaseError({
			message:
				"Cannot create Stripe checkout when there are multiple intervals that require payment upfront. Please use direct billing or separate the purchases.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

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
