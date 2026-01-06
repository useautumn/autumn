import type { UpdateSubscriptionV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import { computeSubscriptionUpdateCustomPlan } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateCustomPlan";
import { computeSubscriptionUpdateQuantityPlan } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateQuantityPlan";
import { SubscriptionUpdateIntentEnum } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateSchema";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";
import { computeSubscriptionUpdateIntent } from "./computeSubscriptionUpdateIntent";

/**
 * Compute the subscription update plan
 * @param ctx - The context
 * @param params - The parameters for the subscription update
 * @returns The subscription update plan
 */
export const computeSubscriptionUpdatePlan = async ({
	ctx,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV0Params;
}): Promise<AutumnBillingPlan> => {
	const intent = computeSubscriptionUpdateIntent(params);

	switch (intent) {
		case SubscriptionUpdateIntentEnum.UpdateQuantity:
			return computeSubscriptionUpdateQuantityPlan({
				ctx,
				updateSubscriptionContext: billingContext,
				params,
			});
		case SubscriptionUpdateIntentEnum.UpdatePlan:
			return await computeSubscriptionUpdateCustomPlan({
				ctx,
				updateSubscriptionContext: billingContext,
				params,
			});
	}
};
