import type {
	AttachBillingContext,
	AttachParamsV0,
	AutumnBillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";

/**
 * Finalizes the attach billing plan by processing line items
 * and applying attach-specific guards.
 */
export const finalizeAttachPlan = ({
	ctx,
	plan,
	attachBillingContext,
	params,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV0;
}): AutumnBillingPlan => {
	plan.lineItems = finalizeLineItems({
		ctx,
		lineItems: plan.lineItems ?? [],
		billingContext: attachBillingContext,
		autumnBillingPlan: plan,
	});

	// Guard: if billing_behavior is 'next_cycle_only', clear line items (skip proration charges)
	if (params.billing_behavior === "next_cycle_only") {
		plan.lineItems = [];
	}

	return plan;
};
