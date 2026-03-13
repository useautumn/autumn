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

	if (billingContext.intent === UpdateSubscriptionIntent.UpdateQuantity) {
		const currentQuantities = new Map(
			billingContext.customerProduct.options.map((option) => [
				option.feature_id,
				option.quantity,
			]),
		);

		const quantitiesUnchanged = billingContext.featureQuantities.every(
			(featureQuantity) =>
				currentQuantities.get(featureQuantity.feature_id) ===
				featureQuantity.quantity,
		);

		const hasAdjustableFeature = billingContext.featureQuantities.some(
			(featureQuantity) =>
				billingContext.adjustableFeatureQuantities?.includes(
					featureQuantity.feature_id,
				) === true,
		);

		if (quantitiesUnchanged && !hasAdjustableFeature) {
			throw new RecaseError({
				message:
					"Cannot create checkout when quantities are not updated or adjustable",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	if (billingContext.intent === UpdateSubscriptionIntent.CancelAction) {
		throw new RecaseError({
			message: "Autumn checkout does not support cancel or uncancel updates",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (billingContext.intent !== UpdateSubscriptionIntent.None) return;

	throw new RecaseError({
		message:
			"Cannot create checkout when no billing changes will happen in this update",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
