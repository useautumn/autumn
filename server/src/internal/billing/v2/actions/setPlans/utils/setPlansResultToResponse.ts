import type { CreateScheduleResponse } from "@autumn/shared";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import type { SetPlansResult } from "../types/setPlansResult";

/** A persisted schedule is "created"; anything that stopped for payment is "pending_payment". */
export const setPlansResultToResponse = ({
	result,
}: {
	result: SetPlansResult;
}): CreateScheduleResponse => {
	const { billingContext, billingResult, persistedSchedule } = result;

	if (!billingResult) {
		throw new Error("set_plans returned no billing result");
	}

	const billingResponse = billingResultToResponse({
		billingContext,
		billingResult,
	});

	return {
		customer_id: billingResponse.customer_id,
		entity_id: billingResponse.entity_id ?? null,
		status: persistedSchedule ? "created" : "pending_payment",
		schedule_id: persistedSchedule?.scheduleId ?? null,
		phases: persistedSchedule?.insertedPhases ?? [],
		invoice: billingResponse.invoice,
		payment_url: billingResponse.payment_url,
		required_action: billingResponse.required_action,
	};
};
