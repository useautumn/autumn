import { ErrCode, type FullCusProduct, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";

/**
 * Backdating creates a brand-new Stripe subscription with backdate_start_date.
 * Any existing subscription/schedule/scheduled product means Stripe would prorate
 * instead, so a past starts_at can't be honored — reject before billing runs.
 */
export const assertNoBackdateWithExistingSubscription = ({
	billingContext,
	subject = "Past starts_at",
}: {
	billingContext: {
		stripeSubscription?: Stripe.Subscription;
		stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
		scheduledCustomerProduct?: FullCusProduct;
	};
	subject?: string;
}) => {
	if (
		billingContext.stripeSubscription ||
		billingContext.stripeSubscriptionSchedule ||
		billingContext.scheduledCustomerProduct
	) {
		throw new RecaseError({
			message: `${subject} is only supported when creating a new Stripe subscription.`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
