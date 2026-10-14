import type {
	AttachBillingContext,
	AutumnBillingPlan,
	BillingContext,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { billingPlanToUpdatedCustomerProduct } from "../billingPlanToUpdatedCustomerProduct";

export const billingPlanToOutgoingEffectiveAt = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext:
		| BillingContext
		| UpdateSubscriptionBillingContext
		| AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const updatedCustomerProduct = billingPlanToUpdatedCustomerProduct({
		autumnBillingPlan,
	});

	if ("intent" in billingContext) {
		if (billingContext.cancelAction === "cancel_end_of_cycle") {
			return updatedCustomerProduct?.ended_at ?? null;
		}

		return billingContext.currentEpochMs;
	}

	if (
		"planTiming" in billingContext &&
		billingContext.planTiming === "end_of_cycle"
	) {
		return updatedCustomerProduct?.ended_at ?? null;
	}

	return billingContext.currentEpochMs;
};
