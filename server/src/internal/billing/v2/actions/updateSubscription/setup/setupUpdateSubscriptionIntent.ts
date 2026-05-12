import { hasCustomItems } from "@api/billing/common/customizePlan/customizePlanV1";
import {
	type CheckoutMode,
	customerProductHasOneOffPrepaidForFeature,
	customerProductHasPrepaidPrice,
	type FullCusProduct,
	isCustomerProductOneOff,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

/**
 * Compute the intent for a subscription update
 */
export const setupUpdateSubscriptionIntent = ({
	params,
	checkoutMode,
	customerProduct,
}: {
	params: UpdateSubscriptionV1Params;
	checkoutMode: CheckoutMode;
	customerProduct: FullCusProduct;
}): UpdateSubscriptionIntent => {
	const featureQuantitiesParams = params.feature_quantities ?? [];

	const itemsChanged = hasCustomItems(params.customize);
	const versionChanged = params.version !== undefined;
	const freeTrialChanged = params.customize?.free_trial !== undefined;

	if (itemsChanged || versionChanged || freeTrialChanged)
		return UpdateSubscriptionIntent.UpdatePlan;

	// ManualTopUp wins over UpdateQuantity (and CancelAction/None): once we know
	// this isn't a plan restructure, any feature_quantities entry targeting a
	// one-off prepaid price on a recurring host routes here. handleManualTopUpErrors
	// then rejects extra fields with "Update too complex to perform."
	if (
		!isCustomerProductOneOff(customerProduct) &&
		featureQuantitiesParams.length > 0
	) {
		const targetsOneOffPrepaid = featureQuantitiesParams.some((fq) =>
			customerProductHasOneOffPrepaidForFeature({
				customerProduct,
				featureId: fq.feature_id,
			}),
		);

		if (targetsOneOffPrepaid) return UpdateSubscriptionIntent.ManualTopUp;
	}

	if (featureQuantitiesParams.length > 0) {
		return UpdateSubscriptionIntent.UpdateQuantity;
	}

	// If no params and checkoutMode
	if (checkoutMode === "autumn_checkout") {
		const hasPrepaid = customerProductHasPrepaidPrice(customerProduct);

		if (hasPrepaid) {
			return UpdateSubscriptionIntent.UpdateQuantity;
		}
	}

	// If cancel action
	if (params.cancel_action) {
		return UpdateSubscriptionIntent.CancelAction;
	}

	return UpdateSubscriptionIntent.None;
};
