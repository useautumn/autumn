import type { UpdateSubscriptionV0Params } from "@shared/index";
import { notNullish } from "@/utils/genUtils";

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
	const itemsChanged = notNullish(params.items);
	const versionChanged = notNullish(params.version);
	const freeTrialChanged = params.free_trial !== undefined;

	if (itemsChanged || versionChanged || freeTrialChanged)
		return UpdateSubscriptionIntent.UpdatePlan;

	// Version change = plan update (takes priority)
	return UpdateSubscriptionIntent.UpdateQuantity;
};
