import { hasCustomItems } from "@api/billing/common/customizePlan/customizePlanV1";
import type { UpdateSubscriptionV1Params } from "@shared/index";

export enum UpdateSubscriptionIntent {
	UpdateQuantity = "update_quantity",
	UpdatePlan = "update_plan",
	None = "none",
}

/**
 * Compute the intent for a subscription update
 */
export const computeUpdateSubscriptionIntent = (
	params: UpdateSubscriptionV1Params,
): UpdateSubscriptionIntent => {
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

	return UpdateSubscriptionIntent.None;
};
