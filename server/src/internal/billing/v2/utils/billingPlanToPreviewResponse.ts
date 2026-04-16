import type { BillingContext, BillingPlan } from "@autumn/shared";
import { type BillingPreviewResponse, orgToCurrency } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToImmediatePreview } from "./billingPlan/toImmediatePreview/billingPlanToImmediatePreview";
import { billingPlanToNextCyclePreview } from "./billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview";
import { billingPlanToChanges } from "./billingPlan/toPreviewChanges/billingPlanToChanges";
import { logBillingPreview } from "./logs/logBillingPreview";

export const billingPlanToPreviewResponse = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): Promise<BillingPreviewResponse> => {
	const { fullCustomer } = billingContext;

	const autumnBillingPlan = billingPlan.autumn;
	const allLineItems = autumnBillingPlan.lineItems ?? [];

	const { immediateLineItems, previewLineItems, subtotal, total } =
		billingPlanToImmediatePreview({ billingPlan });

	const currency = orgToCurrency({ org: ctx.org });

	// Get next cycle object
	const { nextCycle, debug: nextCycleDebug } = billingPlanToNextCyclePreview({
		ctx,
		billingContext,
		billingPlan,
	});

	logBillingPreview({
		ctx,
		allLineItems,
		immediateLineItems,
		total,
		currency,
		nextCycleDebug,
		nextCycle,
	});

	const { incoming, outgoing } = await billingPlanToChanges({
		ctx,
		billingContext,
		billingPlan,
	});

	return {
		object: "billing_preview" as const,
		customer_id: fullCustomer.id || "",
		line_items: previewLineItems,
		subtotal,
		total,
		currency,
		next_cycle: nextCycle,
		incoming,
		outgoing,
		refund: autumnBillingPlan.refundPlan,
	} satisfies BillingPreviewResponse;
};
