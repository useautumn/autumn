import type { UpdateSubscriptionV0Params } from "@shared/index";
import { SubscriptionUpdateIntentEnum } from "./computeSubscriptionUpdateSchema";

/**
 * Compute the intent for a subscription update
 * @param params - The parameters for the subscription update
 * @returns The intent for the subscription update
 */
export const computeSubscriptionUpdateIntent = (
	params: UpdateSubscriptionV0Params,
): SubscriptionUpdateIntentEnum => {
	if (params.options?.length && !params.items?.length)
		return SubscriptionUpdateIntentEnum.UpdateQuantity;
	return SubscriptionUpdateIntentEnum.UpdatePlan;
};
