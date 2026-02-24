import {
	type AutumnBillingPlan,
	isCustomerProductOneOff,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
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
	params: UpdateSubscriptionV1Params;
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

	// Guard: if proration_behavior is 'none', clear line items (skip proration charges)
	if (params.proration_behavior === "none") {
		plan.lineItems = [];
	}

	return plan;
};
