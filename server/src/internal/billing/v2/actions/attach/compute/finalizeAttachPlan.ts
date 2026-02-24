import type {
	AttachBillingContext,
	AttachParamsV1,
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
	params: AttachParamsV1;
}): AutumnBillingPlan => {
	plan.lineItems = finalizeLineItems({
		ctx,
		lineItems: plan.lineItems ?? [],
		billingContext: attachBillingContext,
		autumnBillingPlan: plan,
	});

	// Guard: if proration_behavior is 'none', clear line items (skip proration charges)
	if (params.proration_behavior === "none") {
		plan.lineItems = [];
	}

	return plan;
};
