import type {
	AttachPreviewResponse,
	BillingPlan,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCreateSchedulePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";
import {
	handleCreateScheduleBillingPlanErrors,
	handleCreateScheduleComputeErrors,
	handleCreateScheduleErrors,
} from "@/internal/billing/v2/actions/createSchedule/errors/handleCreateScheduleErrors";
import { setupCreateScheduleBillingContext } from "@/internal/billing/v2/actions/createSchedule/setup/setupCreateScheduleBillingContext";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";

type PreviewSetPlansResult = {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	preview: AttachPreviewResponse;
};

export const previewSetPlansWithContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<PreviewSetPlansResult> => {
	const billingContext = await setupCreateScheduleBillingContext({
		ctx,
		params,
		preview: true,
	});

	await handleCreateScheduleErrors({
		billingContext,
		preview: true,
	});

	const { autumnBillingPlan, immediatePhaseTransition } =
		computeCreateSchedulePlan({
			ctx,
			billingContext,
		});
	await handleCreateScheduleComputeErrors({
		ctx,
		billingContext,
		autumnBillingPlan,
		immediatePhaseTransition,
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

/** Preview the immediate-phase billing cost for a set_plans call. */
export const previewSetPlans = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<AttachPreviewResponse> => {
	const result = await previewSetPlansWithContext({
		ctx,
		params,
	});

	return result.preview;
};
