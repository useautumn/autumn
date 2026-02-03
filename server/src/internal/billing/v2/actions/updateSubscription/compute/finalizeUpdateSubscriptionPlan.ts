import {
	type AutumnBillingPlan,
	isCustomerProductOneOff,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";

/**
 * Finalizes the update subscription billing plan by processing line items
 * and applying update-subscription-specific guards.
 */
export const finalizeUpdateSubscriptionPlan = ({
	ctx,
	plan,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV0Params;
}): AutumnBillingPlan => {
	// Finalize line items (shared logic)
	plan.lineItems = finalizeLineItems({
		ctx,
		lineItems: plan.lineItems ?? [],
		billingContext,
		autumnBillingPlan: plan,
	});

	// Guard: if current customer product is one off, make sure there are no line items
	if (isCustomerProductOneOff(billingContext.customerProduct)) {
		plan.lineItems = [];
	}

	// Guard: if billing_behavior is 'next_cycle_only', clear line items (skip proration charges)
	if (params.billing_behavior === "next_cycle_only") {
		plan.lineItems = [];
	}

	return plan;
};
