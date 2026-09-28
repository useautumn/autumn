import type {
	AttachPreviewResponse,
	BillingPlan,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { prepareCreateSchedulePreview } from "./utils/prepareCreateSchedulePreview";

type PreviewCreateScheduleResult = {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	preview: AttachPreviewResponse;
};

export const previewCreateScheduleWithContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<PreviewCreateScheduleResult> => {
	const { billingContext, billingPlan } = await prepareCreateSchedulePreview({
		ctx,
		params,
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

/** Preview the immediate-phase billing cost for a create_schedule call. */
export const previewCreateSchedule = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<AttachPreviewResponse> => {
	const result = await previewCreateScheduleWithContext({
		ctx,
		params,
	});

	return result.preview;
};
