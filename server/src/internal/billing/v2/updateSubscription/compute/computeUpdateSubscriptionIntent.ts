import type { UpdateSubscriptionV0Params } from "@shared/index";

export enum UpdateSubscriptionIntent {
	UpdateQuantity = "update_quantity",
	UpdatePlan = "update_plan",
}

/**
 * Compute the intent for a subscription update
 */
export const computeUpdateSubscriptionIntent = (
	params: UpdateSubscriptionV0Params,
): UpdateSubscriptionIntent => {
	const itemsChanged = params.items !== undefined;
	const versionChanged = params.version !== undefined;
	const freeTrialChanged = params.free_trial !== undefined;

	if (itemsChanged || versionChanged || freeTrialChanged)
		return UpdateSubscriptionIntent.UpdatePlan;

	// Version change = plan update (takes priority)
	return UpdateSubscriptionIntent.UpdateQuantity;
};
