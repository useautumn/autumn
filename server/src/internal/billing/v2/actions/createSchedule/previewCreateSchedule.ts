import type {
	AttachPreviewResponse,
	BillingPlan,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { computeCreateSchedulePlan } from "./compute/computeCreateSchedulePlan";
import { handleCreateScheduleErrors } from "./errors/handleCreateScheduleErrors";
import { setupCreateScheduleBillingContext } from "./setup/setupCreateScheduleBillingContext";

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
	const billingContext = await setupCreateScheduleBillingContext({
		ctx,
		params,
	});

	handleCreateScheduleErrors({
		billingContext,
	});

	const { autumnBillingPlan } = computeCreateSchedulePlan({
		ctx,
		billingContext,
	});
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
		checkoutMode: billingContext.checkoutMode,
	});

	const billingPlan = { autumn: autumnBillingPlan, stripe: stripeBillingPlan };

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
