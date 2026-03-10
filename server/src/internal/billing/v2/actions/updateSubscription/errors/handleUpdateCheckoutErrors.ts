import {
	ErrCode,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
} from "@autumn/shared";

export const handleUpdateCheckoutErrors = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	if (billingContext.checkoutMode !== "autumn_checkout") return;

	if (billingContext.intent !== UpdateSubscriptionIntent.None) return;

	throw new RecaseError({
		message:
			"Cannot create checkout when no billing changes will happen in this update",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
