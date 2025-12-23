import type { SubscriptionUpdateV0Params } from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeSubscriptionUpdateCustomPlan } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateCustomPlan";
import { computeSubscriptionUpdateQuantityPlan } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateQuantityPlan";
import { SubscriptionUpdateIntentEnum } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateSchema";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";
import { computeSubscriptionUpdateIntent } from "./computeSubscriptionUpdateIntent";

/**
 * Compute the subscription update plan
 * @param ctx - The context
 * @param params - The parameters for the subscription update
 * @returns The subscription update plan
 */
export const computeSubscriptionUpdatePlan = async ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}) => {
	const intent = computeSubscriptionUpdateIntent(params);

	switch (intent) {
		case SubscriptionUpdateIntentEnum.UpdateQuantity:
			return computeSubscriptionUpdateQuantityPlan({
				ctx,
				updateSubscriptionContext,
				params,
			});
		case SubscriptionUpdateIntentEnum.UpdatePlan:
			return await computeSubscriptionUpdateCustomPlan({
				ctx,
				updateSubscriptionContext,
				params,
			});
	}
};
