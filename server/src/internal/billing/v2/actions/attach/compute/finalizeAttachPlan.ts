import type { AttachBillingContext, AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";

/**
 * Finalizes the attach billing plan by processing line items.
 */
export const finalizeAttachPlan = ({
	ctx,
	plan,
	attachBillingContext,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	attachBillingContext: AttachBillingContext;
}): AutumnBillingPlan => {
	plan.lineItems = finalizeLineItems({
		ctx,
		lineItems: plan.lineItems ?? [],
		billingContext: attachBillingContext,
		autumnBillingPlan: plan,
	});

	return plan;
};
