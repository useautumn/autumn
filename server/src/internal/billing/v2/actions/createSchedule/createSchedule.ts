import {
	type CreateScheduleParamsV0,
	type CreateScheduleResponse,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { computeCreateSchedulePlan } from "./compute/computeCreateSchedulePlan";
import { normalizeCreateSchedulePhases } from "./errors/normalizeCreateSchedulePhases";
import { setupCreateScheduleBillingContext } from "./setup/setupCreateScheduleBillingContext";
import type { MaterializedScheduledPhase } from "./utils/materializeScheduledPhases";
import { materializeScheduledPhases } from "./utils/materializeScheduledPhases";
import { persistCreateSchedule } from "./utils/persistCreateSchedule";

/** Merge immediate billing changes with future scheduled rows for Autumn execution. */
const buildCreateScheduleExecutionPlan = ({
	immediateAutumnBillingPlan,
	futureScheduledPhases,
}: {
	immediateAutumnBillingPlan: ReturnType<typeof computeCreateSchedulePlan>;
	futureScheduledPhases: MaterializedScheduledPhase[];
}) => ({
	...immediateAutumnBillingPlan,
	insertCustomerProducts: [
		...immediateAutumnBillingPlan.insertCustomerProducts,
		...futureScheduledPhases.flatMap((phase) => phase.customerProducts),
	],
	customPrices: [
		...(immediateAutumnBillingPlan.customPrices ?? []),
		...futureScheduledPhases.flatMap((phase) => phase.customPrices),
	],
	customEntitlements: [
		...(immediateAutumnBillingPlan.customEntitlements ?? []),
		...futureScheduledPhases.flatMap((phase) => phase.customEntitlements),
	],
});

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

	const immediateAutumnBillingPlan = computeCreateSchedulePlan({
		ctx,
		billingContext,
	});
	const immediatePhaseCustomerProductIds =
		immediateAutumnBillingPlan.insertCustomerProducts.map(
			(customerProduct) => customerProduct.id,
		);
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan: immediateAutumnBillingPlan,
		checkoutMode: billingContext.checkoutMode,
	});

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
