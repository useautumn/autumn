import type { SubscriptionUpdateV0Params } from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SubscriptionUpdatePlan } from "../../types";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";
import { computeSubscriptionUpdateIntent } from "./computeSubscriptionUpdateIntent";
import { getComputeSubscriptionUpdatePlanFunction } from "./computeSubscriptionUpdatePlanIntentMap";

/**
 * Compute the subscription update plan
 * @param ctx - The context
 * @param params - The parameters for the subscription update
 * @returns The subscription update plan
 */
export const computeSubscriptionUpdatePlan = ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}): SubscriptionUpdatePlan => {
	const intent = computeSubscriptionUpdateIntent(params);
	const computePlan = getComputeSubscriptionUpdatePlanFunction(intent);

	return computePlan({ ctx, updateSubscriptionContext, params });
};
