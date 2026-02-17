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
	const itemsChanged = params.customize !== undefined;
	const versionChanged = params.version !== undefined;
	const freeTrialChanged = params.free_trial !== undefined;

	if (itemsChanged || versionChanged || freeTrialChanged)
		return UpdateSubscriptionIntent.UpdatePlan;

	// Version change = plan update (takes priority)
	const featureQuantitiesChanges =
		params.options?.length && params.options.length > 0;

	if (featureQuantitiesChanges) {
		return UpdateSubscriptionIntent.UpdateQuantity;
	}

	return UpdateSubscriptionIntent.None;
};
