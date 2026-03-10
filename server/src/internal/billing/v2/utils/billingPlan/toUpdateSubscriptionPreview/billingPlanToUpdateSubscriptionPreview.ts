import type {
	BillingPlan,
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToPreviewResponse } from "../../billingPlanToPreviewResponse";
import { billingPlanToUpdateSubscriptionPreviewIntent } from "./billingPlanToUpdateSubscriptionPreviewIntent";

export const billingPlanToUpdateSubscriptionPreview = async ({
	ctx,
	billingContext,
	billingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
	params: UpdateSubscriptionV1Params;
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
			params,
			billingContext,
		}),
	} satisfies PreviewUpdateSubscriptionResponse;
};
