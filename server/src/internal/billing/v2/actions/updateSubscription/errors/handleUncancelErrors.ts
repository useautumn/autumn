import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import { CusProductStatus, RecaseError } from "@autumn/shared";

export const handleUncancelErrors = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	if (billingContext.cancelAction !== "uncancel") {
		return;
	}

	const { customerProduct, canceledStripeSubscriptionId } = billingContext;

	if (customerProduct.status === CusProductStatus.Scheduled) {
		throw new RecaseError({
			message: "Cannot uncancel a subscription that is scheduled",
			statusCode: 400,
		});
	}

	if (customerProduct.status === CusProductStatus.Expired) {
		throw new RecaseError({
			message: "Cannot uncancel a subscription that has expired",
			statusCode: 400,
		});
	}

	if (canceledStripeSubscriptionId) {
		throw new RecaseError({
			message: `Subscription ${canceledStripeSubscriptionId} is already canceled in Stripe and cannot be uncanceled; attach the plan again to start a new subscription.`,
			statusCode: 400,
		});
	}
};
