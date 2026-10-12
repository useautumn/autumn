import {
	type AttachBillingContext,
	type BillingPlan,
	type PreviewUpdateSubscriptionResponse,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionPreviewIntent,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToPreviewResponse } from "../../billingPlanToPreviewResponse";
import { billingPlanToUpdateSubscriptionPreviewIntent } from "./billingPlanToUpdateSubscriptionPreviewIntent";

export const billingPlanToUpdateSubscriptionPreview = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	/** Attach when a pending plan is edited, since that edit re-attaches the plan. */
	billingContext: UpdateSubscriptionBillingContext | AttachBillingContext;
	billingPlan: BillingPlan;
}): Promise<PreviewUpdateSubscriptionResponse> => {
	const { credit_applied, ...basePreview } = await billingPlanToPreviewResponse(
		{
			ctx,
			billingContext,
			billingPlan,
		},
	);

	const invoiceCredits = billingPlan.preview?.invoiceCredits;

	return {
		...basePreview,
		object: "update_subscription_preview",
		intent:
			"intent" in billingContext
				? billingPlanToUpdateSubscriptionPreviewIntent({ billingContext })
				: UpdateSubscriptionPreviewIntent.UpdatePlan,
		tax: billingPlan.preview?.tax,
		invoice_credits: invoiceCredits
			? { ...invoiceCredits, applied: credit_applied }
			: undefined,
	} satisfies PreviewUpdateSubscriptionResponse;
};
