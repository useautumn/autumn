import type {
	AttachPreviewResponse,
	BillingPlan,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { prepareSetPlans } from "./utils/prepareSetPlans";

type PreviewSetPlansBillingResult = {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	preview: AttachPreviewResponse;
};

export const previewSetPlansBillingWithContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<PreviewSetPlansBillingResult> => {
	const { billingContext, billingPlan } = await prepareSetPlans({
		ctx,
		params,
		preview: true,
	});

	return {
		billingContext,
		billingPlan,
		preview: await billingPlanToAttachPreview({
			ctx,
			billingContext,
			billingPlan,
		}),
	};
};

/** Preview the immediate-phase billing cost for a set_plans call. */
export const previewSetPlansBilling = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<AttachPreviewResponse> => {
	const result = await previewSetPlansBillingWithContext({
		ctx,
		params,
	});

	return result.preview;
};
