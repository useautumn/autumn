import type {
	AttachBillingContext,
	AttachParamsV1,
	AutumnBillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeRefundPlan } from "@/internal/billing/v2/compute/finalize/computeRefundPlan";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";

/**
 * Finalizes the attach billing plan by processing line items
 * and applying attach-specific guards.
 */
export const finalizeAttachPlan = async ({
	ctx,
	plan,
	attachBillingContext,
	params,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV1;
}): Promise<AutumnBillingPlan> => {
	plan.lineItems = finalizeLineItems({
		ctx,
		lineItems: plan.lineItems ?? [],
		billingContext: attachBillingContext,
		autumnBillingPlan: plan,
		customLineItems: params.custom_line_items,
	});

	const { lineItems, refundPlan } = await computeRefundPlan({
		ctx,
		billingContext: attachBillingContext,
		lineItems: plan.lineItems ?? [],
	});

	plan.lineItems = lineItems;
	plan.refundPlan = refundPlan;

	return plan;
};
