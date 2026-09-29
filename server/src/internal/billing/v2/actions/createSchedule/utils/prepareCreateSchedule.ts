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
import { ensureFreePhaseStripeProducts } from "./ensureFreePhaseStripeProducts";

type PreparedCreateSchedule = {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	phases: CreateSchedulePlanResult["phases"];
	immediatePhaseTransition: CreateSchedulePlanResult["immediatePhaseTransition"];
};

/** Setup, compute and evaluate a create_schedule call, checking errors between each step. */
export const prepareCreateSchedule = async ({
	ctx,
	params,
	preview,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	preview: boolean;
}): Promise<PreparedCreateSchedule> => {
	const billingContext = await setupCreateScheduleBillingContext({
		ctx,
		params,
		preview,
	});

	await handleCreateScheduleErrors({ billingContext, preview });

	const { autumnBillingPlan, phases, immediatePhaseTransition } =
		computeCreateSchedulePlan({ ctx, billingContext });
	await handleCreateScheduleComputeErrors({
		ctx,
		billingContext,
		autumnBillingPlan,
		immediatePhaseTransition,
	});

	if (!preview) {
		await ensureFreePhaseStripeProducts({
			ctx,
			billingContext,
			autumnBillingPlan,
		});
	}

	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
		checkoutMode: billingContext.checkoutMode,
	});
	const billingPlan: BillingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlan,
	};

	handleCreateScheduleBillingPlanErrors({ ctx, billingContext, billingPlan });

	if (preview) {
		billingPlan.preview = await computeAttachPreviewBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});
	}

	return { billingContext, billingPlan, phases, immediatePhaseTransition };
};
