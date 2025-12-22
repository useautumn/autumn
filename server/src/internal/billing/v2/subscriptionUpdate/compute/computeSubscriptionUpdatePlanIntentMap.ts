import {
	ErrCode,
	RecaseError,
	type SubscriptionUpdateV0Params,
} from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SubscriptionUpdatePlan } from "../../typesOld";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";
import { computeSubscriptionUpdateQuantityPlan } from "./computeSubscriptionUpdateQuantityPlan";
import { SubscriptionUpdateIntentEnum } from "./computeSubscriptionUpdateSchema";

export type ComputeSubscriptionUpdatePlan = ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}) => SubscriptionUpdatePlan;

export type ComputeSubscriptionUpdatePlanIntentMap = Partial<
	Record<SubscriptionUpdateIntentEnum, ComputeSubscriptionUpdatePlan>
>;

/**
 * Map of intent to function to compute the subscription update plan
 */
const computeSubscriptionUpdatePlanIntentMap: ComputeSubscriptionUpdatePlanIntentMap =
	{
		[SubscriptionUpdateIntentEnum.UpdateQuantity]:
			computeSubscriptionUpdateQuantityPlan,
	};

export const getComputeSubscriptionUpdatePlanFunction = (
	intent: SubscriptionUpdateIntentEnum,
): ComputeSubscriptionUpdatePlan => {
	const plan = computeSubscriptionUpdatePlanIntentMap[intent];

	if (!plan) {
		throw new RecaseError({
			message: `[Compute Subscription Update] Invalid intent: ${intent}`,
			code: ErrCode.InvalidInputs,
			statusCode: 500,
		});
	}
	return plan;
};
