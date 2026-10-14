import {
	InternalError,
	type UpdateSubscriptionBillingContextOverride,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { updateSubscription } from "@/internal/billing/v2/actions/updateSubscription/updateSubscription";
import { billingPlanToUpdateSubscriptionPreview } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreview";
import { billingPlanToUpdateSubscriptionPreviewIntent } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreviewIntent";

export const previewUpdateSubscription = async ({
	ctx,
	params,
	contextOverride,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	contextOverride?: UpdateSubscriptionBillingContextOverride;
}) => {
	const { billingContext, billingPlan } = await updateSubscription({
		ctx,
		params,
		preview: true,
		contextOverride,
	});

	if (!billingPlan) {
		throw new InternalError({
			message: "billingPlan not returned from updateSubscription preview",
		});
	}

	return billingPlanToUpdateSubscriptionPreview({
		ctx,
		billingContext,
		billingPlan,
		intent: billingPlanToUpdateSubscriptionPreviewIntent({ billingContext }),
	});
};
