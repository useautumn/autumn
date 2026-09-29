import type {
	BillingResult,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
	CreateScheduleResponse,
} from "@autumn/shared";
import { CheckoutAction } from "@autumn/shared";
import { checkoutSessionLock } from "@/external/redis/actions/checkoutSessionLock/checkoutSessionLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkCheckoutSessionLock } from "@/internal/billing/v2/actions/locks/checkoutSessionLock/checkCheckoutSessionLock";
import { createAutumnCheckout } from "@/internal/billing/v2/common/createAutumnCheckout";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { hashJson } from "@/utils/hash/hashJson";
import { persistSetPlansSchedule } from "./utils/persistSetPlansSchedule";
import { prepareSetPlans } from "./utils/prepareSetPlans";

const buildPendingSetPlansResponse = ({
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

/** Set a customer's plans: bill the immediate phase and schedule Autumn-managed future phases. */
export const setPlans = async ({
	ctx,
	params,
	skipAutumnCheckout = false,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	skipAutumnCheckout?: boolean;
}): Promise<CreateScheduleResponse> => {
	const checkoutReservation = !skipAutumnCheckout
		? await checkoutSessionLock.get({ ctx, customerId: params.customer_id })
		: undefined;

	const { billingContext, billingPlan, phases } = await prepareSetPlans({
		ctx,
		params,
		preview: false,
	});

	if (!skipAutumnCheckout) {
		const cachedResult = await checkCheckoutSessionLock({
			ctx,
			params,
			billingContext,
			billingPlan,
			existingLock: checkoutReservation,
		});

		if (cachedResult?.billingResult) {
			return buildPendingSetPlansResponse({
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

		return buildPendingSetPlansResponse({
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

	// Checkout completion owns schedule persistence when execution is deferred or
	// the Stripe subscription does not exist yet.
	const deferScheduleToWebhook =
		billingResult.stripe.deferred ||
		(billingContext.enablePlanImmediately &&
			billingContext.checkoutMode === "stripe_checkout");

	if (deferScheduleToWebhook) {
		return buildPendingSetPlansResponse({
			billingContext,
			billingResult,
		});
	}

	const { insertedPhases, scheduleId } = await persistSetPlansSchedule({
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
