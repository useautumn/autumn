import type {
	BillingPlan,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import {
	type CreateSchedulePlanResult,
	computeCreateSchedulePlan,
} from "../compute/computeCreateSchedulePlan";
import {
	handleCreateScheduleBillingPlanErrors,
	handleCreateScheduleComputeErrors,
	handleCreateScheduleErrors,
} from "../errors/handleCreateScheduleErrors";
import { setupCreateScheduleBillingContext } from "../setup/setupCreateScheduleBillingContext";

type PreparedCreateSchedulePreview = {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	phases: CreateSchedulePlanResult["phases"];
	immediatePhaseTransition: CreateSchedulePlanResult["immediatePhaseTransition"];
};

export const prepareCreateSchedulePreview = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<PreparedCreateSchedulePreview> => {
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

	return {
		billingContext,
		billingPlan: { ...billingPlan, preview: previewBillingPlan },
		phases,
		immediatePhaseTransition,
	};
};
