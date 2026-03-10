import { hasCustomItems } from "@api/billing/common/customizePlan/customizePlanV1";
import {
	type CheckoutMode,
	customerProductHasPrepaidPrice,
	type FullCusProduct,
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
	const itemsChanged = hasCustomItems(params.customize);
	const versionChanged = params.version !== undefined;
	const freeTrialChanged = params.customize?.free_trial !== undefined;

	if (itemsChanged || versionChanged || freeTrialChanged)
		return UpdateSubscriptionIntent.UpdatePlan;

	// Version change = plan update (takes priority)
	const featureQuantitiesChanges =
		params.feature_quantities?.length && params.feature_quantities.length > 0;

	if (featureQuantitiesChanges) {
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
