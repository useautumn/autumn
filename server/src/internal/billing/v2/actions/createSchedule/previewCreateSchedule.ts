import type { BillingPreviewResponse } from "@autumn/shared";
import { type CreateScheduleParamsV0, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import { computeCreateSchedulePlan } from "./compute/computeCreateSchedulePlan";
import {
	getCurrentCreateSchedulePhaseIndex,
	normalizeCreateSchedulePhases,
} from "./errors/normalizeCreateSchedulePhases";
import { setupCreateScheduleBillingContext } from "./setup/setupCreateScheduleBillingContext";
import { resolveCurrentEpochMs } from "./utils/resolveCurrentEpochMs";

/** Preview the immediate-phase billing cost for a create_schedule call. */
export const previewCreateSchedule = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<BillingPreviewResponse> => {
	const currentEpochMs = await resolveCurrentEpochMs({
		ctx,
		customerId: params.customer_id,
	});
	const normalizedPhases = normalizeCreateSchedulePhases({
		currentEpochMs,
		phases: params.phases,
	});
	const currentPhaseIndex = getCurrentCreateSchedulePhaseIndex({
		currentEpochMs,
		phases: normalizedPhases,
	});
	const immediatePhase =
		normalizedPhases[currentPhaseIndex === -1 ? 0 : currentPhaseIndex];

	if (!immediatePhase) {
		throw new RecaseError({
			message: "At least one phase must be provided",
			statusCode: 400,
		});
	}

	const billingContext = await setupCreateScheduleBillingContext({
		ctx,
		params,
		immediatePhase,
	});

	if (billingContext.checkoutMode) {
		throw new RecaseError({
			message: "Please attach a payment method before creating a schedule.",
			statusCode: 400,
		});
	}

	const { autumnBillingPlan } = computeCreateSchedulePlan({
		ctx,
		billingContext,
		immediatePhase,
	});
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
		checkoutMode: billingContext.checkoutMode,
	});

	const billingPlan = { autumn: autumnBillingPlan, stripe: stripeBillingPlan };

	return billingPlanToPreviewResponse({ ctx, billingContext, billingPlan });
};
