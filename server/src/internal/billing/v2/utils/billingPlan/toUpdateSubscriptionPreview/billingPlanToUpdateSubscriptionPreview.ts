import type {
	BillingPlan,
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionBillingContext,
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
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
}): Promise<PreviewUpdateSubscriptionResponse> => {
	const basePreview = await billingPlanToPreviewResponse({
		ctx,
		billingContext,
		billingPlan,
	});

	return {
		...basePreview,
		object: "update_subscription_preview",
		intent: billingPlanToUpdateSubscriptionPreviewIntent({
			billingContext,
		}),
	} satisfies PreviewUpdateSubscriptionResponse;
};
