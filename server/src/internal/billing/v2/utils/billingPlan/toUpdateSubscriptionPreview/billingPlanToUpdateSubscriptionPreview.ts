import type {
	BillingContext,
	BillingPlan,
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionPreviewIntent,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToPreviewResponse } from "../../billingPlanToPreviewResponse";

export const billingPlanToUpdateSubscriptionPreview = async ({
	ctx,
	billingContext,
	billingPlan,
	intent,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	intent: UpdateSubscriptionPreviewIntent;
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
		intent,
		tax: billingPlan.preview?.tax,
		invoice_credits: invoiceCredits
			? { ...invoiceCredits, applied: credit_applied }
			: undefined,
	} satisfies PreviewUpdateSubscriptionResponse;
};
