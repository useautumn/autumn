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
	// Version change = plan update (takes priority)
	if (params.version !== undefined)
		return UpdateSubscriptionIntent.UpdatePlan;

	if (params.options?.length && !params.items?.length)
		return UpdateSubscriptionIntent.UpdateQuantity;

	return UpdateSubscriptionIntent.UpdatePlan;
};
