import {
	type AutumnBillingPlan,
	isCustomerProductOneOff,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyUpdateSubscriptionBillingCycleAnchor } from "@/internal/billing/v2/actions/updateSubscription/compute/applyUpdateSubscriptionBillingCycleAnchor";
import { computeRefundPlan } from "@/internal/billing/v2/compute/finalize/computeRefundPlan";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { finalizeUpdateSubscriptionPooledBalancePlan } from "./finalizeUpdateSubscriptionPooledBalancePlan";

/**
 * Finalizes the update subscription billing plan by processing line items,
 * applying update-subscription-specific guards, and computing refund preview.
 */
export const finalizeUpdateSubscriptionPlan = async ({
	ctx,
	plan,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}): Promise<AutumnBillingPlan> => {
	plan = applyUpdateSubscriptionBillingCycleAnchor({ plan, billingContext });

	// Finalize line items (shared logic)
	plan.lineItems = finalizeLineItems({
		ctx,
		lineItems: plan.lineItems ?? [],
		billingContext,
		autumnBillingPlan: plan,
		customLineItems: params.custom_line_items,
	});

	// Guard: if current customer product is one off, make sure there are no line items
	if (isCustomerProductOneOff(billingContext.customerProduct)) {
		plan.lineItems = [];
	}

	// Filter refund line items and compute the refund plan
	const { lineItems: filteredLineItems, refundPlan } = await computeRefundPlan({
		ctx,
		billingContext,
		lineItems: plan.lineItems ?? [],
	});

	plan.lineItems = filteredLineItems;
	plan.refundPlan = refundPlan;
	plan = finalizeUpdateSubscriptionPooledBalancePlan({
		ctx,
		plan,
		billingContext,
	});

	return plan;
};
