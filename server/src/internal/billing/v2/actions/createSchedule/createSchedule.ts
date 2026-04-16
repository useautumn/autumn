import type {
	CreateScheduleParamsV0,
	CreateScheduleResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { computeCreateSchedulePlan } from "./compute/computeCreateSchedulePlan";
import { handleCreateScheduleErrors } from "./errors/handleCreateScheduleErrors";
import { setupCreateScheduleBillingContext } from "./setup/setupCreateScheduleBillingContext";
import { persistCreateSchedule } from "./utils/persistCreateSchedule";

/** Create a schedule with immediate-phase billing and Autumn-managed future phases. */
export const createSchedule = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<CreateScheduleResponse> => {
	const billingContext = await setupCreateScheduleBillingContext({
		ctx,
		params,
	});

	handleCreateScheduleErrors({ billingContext });

	const { autumnBillingPlan, phases } = computeCreateSchedulePlan({
		ctx,
		billingContext,
	});

	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
		checkoutMode: billingContext.checkoutMode,
	});

	const billingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlan,
	};
	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan,
	});

	const { insertedPhases, scheduleId } = await persistCreateSchedule({
		ctx,
		params,
		currentEpochMs: billingContext.currentEpochMs,
		fullCustomer: billingContext.fullCustomer,
		phases,
	});

	const billingResponse = billingResultToResponse({
		billingContext,
		billingResult,
	});

	return {
		customer_id: billingResponse.customer_id,
		entity_id: billingResponse.entity_id ?? null,
		schedule_id: scheduleId,
		phases: insertedPhases,
		invoice: billingResponse.invoice,
		payment_url: billingResponse.payment_url,
		required_action: billingResponse.required_action,
	};
};
