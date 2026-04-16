import {
	type CreateScheduleParamsV0,
	type CreateScheduleResponse,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { buildCreateScheduleExecutionPlan } from "./compute/buildCreateScheduleExecutionPlan";
import { computeCreateSchedulePlan } from "./compute/computeCreateSchedulePlan";
import { normalizeCreateSchedulePhases } from "./errors/normalizeCreateSchedulePhases";
import { setupCreateScheduleBillingContext } from "./setup/setupCreateScheduleBillingContext";
import { materializeScheduledPhases } from "./utils/materializeScheduledPhases";
import { persistCreateSchedule } from "./utils/persistCreateSchedule";

/** Create a schedule with immediate-phase billing and Autumn-managed future phases. */
export const createSchedule = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<CreateScheduleResponse> => {
	const currentEpochMs = Date.now();
	const normalizedPhases = normalizeCreateSchedulePhases({
		currentEpochMs,
		phases: params.phases,
	});
	const [immediatePhase, ...futurePhases] = normalizedPhases;

	const billingContext = await setupCreateScheduleBillingContext({
		ctx,
		params,
		immediatePhase,
	});

	if (billingContext.checkoutMode) {
		throw new RecaseError({
			message:
				"create_schedule requires an immediately billable first phase; checkout flows are not supported yet",
			statusCode: 400,
		});
	}

	const {
		autumnBillingPlan: immediateAutumnBillingPlan,
		immediatePhaseCustomerProducts,
	} = computeCreateSchedulePlan({
		ctx,
		billingContext,
		immediatePhase,
		nextPhaseStartsAt: futurePhases[0]?.starts_at,
	});
	const immediatePhaseCustomerProductIds = immediatePhaseCustomerProducts.map(
		(customerProduct) => customerProduct.id,
	);
	const futureScheduledPhases = await materializeScheduledPhases({
		ctx,
		currentEpochMs,
		fullCustomer: billingContext.fullCustomer,
		phases: futurePhases,
	});
	const autumnExecutionPlan = buildCreateScheduleExecutionPlan({
		immediateAutumnBillingPlan,
		futureScheduledPhases,
	});
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan: autumnExecutionPlan,
		checkoutMode: billingContext.checkoutMode,
	});

	const billingPlan = {
		autumn: autumnExecutionPlan,
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
		currentEpochMs,
		fullCustomer: billingContext.fullCustomer,
		immediatePhaseStartsAt: immediatePhase.starts_at,
		immediatePhaseCustomerProductIds,
		futureScheduledPhases,
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
