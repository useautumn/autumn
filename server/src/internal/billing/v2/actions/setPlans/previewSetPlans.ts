import type {
	BillingPlan,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
	SetPlansPreviewResponse,
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
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { buildSetPlansPreview } from "./preview/buildSetPlansPreview";

type PreviewSetPlansResult = {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	preview: SetPlansPreviewResponse;
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

	const { autumnBillingPlan, phases, immediatePhaseTransition } =
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
		preview: await buildSetPlansPreview({
			ctx,
			billingContext,
			billingPlan: billingPlanWithPreview,
			phases,
			outgoingCustomerProducts:
				immediatePhaseTransition.outgoingCustomerProducts,
		}),
	};
};

/** Preview the phase-by-phase Autumn and Stripe changes for a set_plans call. */
export const previewSetPlans = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<SetPlansPreviewResponse> => {
	const result = await previewSetPlansWithContext({
		ctx,
		params,
	});

	return result.preview;
};
