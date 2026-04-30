import type {
	BillingResult,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
	CreateScheduleResponse,
} from "@autumn/shared";
import { CheckoutAction } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkCheckoutSessionLock } from "@/internal/billing/v2/actions/locks/checkoutSessionLock/checkCheckoutSessionLock";
import { createAutumnCheckout } from "@/internal/billing/v2/common/createAutumnCheckout";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { hashJson } from "@/utils/hash/hashJson";
import { computeCreateSchedulePlan } from "./compute/computeCreateSchedulePlan";
import { handleCreateScheduleErrors } from "./errors/handleCreateScheduleErrors";
import { setupCreateScheduleBillingContext } from "./setup/setupCreateScheduleBillingContext";
import { persistCreateSchedule } from "./utils/persistCreateSchedule";

const buildPendingCreateScheduleResponse = ({
	billingContext,
	billingResult,
}: {
	billingContext: CreateScheduleBillingContext;
	billingResult: BillingResult;
}): CreateScheduleResponse => {
	const billingResponse = billingResultToResponse({
		billingContext,
		billingResult,
	});

	return {
		customer_id: billingResponse.customer_id,
		entity_id: billingResponse.entity_id ?? null,
		status: "pending_payment",
		schedule_id: null,
		phases: [],
		invoice: billingResponse.invoice,
		payment_url: billingResponse.payment_url,
		required_action: billingResponse.required_action,
	};
};

/** Create a schedule with immediate-phase billing and Autumn-managed future phases. */
export const createSchedule = async ({
	ctx,
	params,
	skipAutumnCheckout = false,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	skipAutumnCheckout?: boolean;
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

	if (!skipAutumnCheckout) {
		const cachedResult = await checkCheckoutSessionLock({
			ctx,
			params,
			billingContext,
			billingPlan,
		});

		if (cachedResult?.billingResult) {
			return buildPendingCreateScheduleResponse({
				billingContext,
				billingResult: cachedResult.billingResult,
			});
		}
	}

	if (
		billingContext.checkoutMode === "autumn_checkout" &&
		!skipAutumnCheckout
	) {
		const { billingResult } = await createAutumnCheckout({
			ctx,
			action: CheckoutAction.CreateSchedule,
			params,
			billingContext,
			billingPlan,
		});

		if (!billingResult) {
			throw new Error("createAutumnCheckout did not return a billing result");
		}

		return buildPendingCreateScheduleResponse({
			billingContext,
			billingResult,
		});
	}

	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan,
		checkoutLockParamsHash: !skipAutumnCheckout
			? hashJson({ value: params })
			: undefined,
	});

	// When deferred (legacy stripe_checkout) OR enable_plan_immediately is set,
	// the schedule rows are persisted in the webhook handler — at this point
	// either no Stripe subscription exists yet, or we're explicitly delaying
	// schedule materialization to the same point as the deferred flow.
	if (billingResult.stripe.deferred || billingContext.enablePlanImmediately) {
		return buildPendingCreateScheduleResponse({
			billingContext,
			billingResult,
		});
	}

	const { insertedPhases, scheduleId } = await persistCreateSchedule({
		ctx,
		customerId: params.customer_id,
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
		status: "created",
		schedule_id: scheduleId,
		phases: insertedPhases,
		invoice: billingResponse.invoice,
		payment_url: billingResponse.payment_url,
		required_action: billingResponse.required_action,
	};
};
