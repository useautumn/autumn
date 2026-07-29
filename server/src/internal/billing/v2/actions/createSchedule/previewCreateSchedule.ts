import type {
	AttachPreviewResponse,
	BillingPlan,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { computeCreateSchedulePlan } from "./compute/computeCreateSchedulePlan";
import {
	handleCreateScheduleBillingPlanErrors,
	handleCreateScheduleErrors,
} from "./errors/handleCreateScheduleErrors";
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
		preview: true,
	});

	await handleCreateScheduleErrors({
		db: ctx.db,
		billingContext,
		preview: true,
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

	handleCreateScheduleBillingPlanErrors({ ctx, billingContext, billingPlan });

	const previewBillingPlan = await computeAttachPreviewBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
	});
	const billingPlanWithPreview = {
		...billingPlan,
		preview: previewBillingPlan,
	};

	return {
		billingContext,
		billingPlan: billingPlanWithPreview,
		preview: await billingPlanToAttachPreview({
			ctx,
			billingContext,
			billingPlan: billingPlanWithPreview,
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
