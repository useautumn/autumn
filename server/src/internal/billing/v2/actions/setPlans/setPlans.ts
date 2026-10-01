import {
	type BillingPlan,
	CheckoutAction,
	type SetPlansParamsV0,
} from "@autumn/shared";
import { checkoutSessionLock } from "@/external/redis/actions/checkoutSessionLock/checkoutSessionLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkCheckoutSessionLock } from "@/internal/billing/v2/actions/locks/checkoutSessionLock/checkCheckoutSessionLock";
import { createAutumnCheckout } from "@/internal/billing/v2/common/createAutumnCheckout";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { hashJson } from "@/utils/hash/hashJson";
import { computeSetPlansPlan } from "./compute/computeSetPlansPlan";
import {
	handleSetPlansBillingPlanErrors,
	handleSetPlansComputeErrors,
	handleSetPlansErrors,
} from "./errors/handleSetPlansErrors";
import { logSetPlansContext } from "./logs/logSetPlansContext";
import { setupSetPlansBillingContext } from "./setup/setupSetPlansBillingContext";
import { findOutOfScopeCustomerProductIds } from "./subscriptionScope/findOutOfScopeCustomerProductIds";
import type { SetPlansResult } from "./types/setPlansResult";
import { buildReplacedSubscriptionAction } from "./utils/buildReplacedSubscriptionAction";
import { ensureFreePhaseStripeProducts } from "./utils/ensureFreePhaseStripeProducts";
import { persistSetPlansSchedule } from "./utils/persistSetPlansSchedule";

/** Set a customer's plans: bill the immediate phase and schedule Autumn-managed future phases. */
export const setPlans = async ({
	ctx,
	params,
	preview = false,
	skipAutumnCheckout = false,
}: {
	ctx: AutumnContext;
	params: SetPlansParamsV0;
	preview?: boolean;
	skipAutumnCheckout?: boolean;
}): Promise<SetPlansResult> => {
	const checkoutReservation =
		!preview && !skipAutumnCheckout
			? await checkoutSessionLock.get({ ctx, customerId: params.customer_id })
			: undefined;

	const billingContext = await setupSetPlansBillingContext({
		ctx,
		params,
		preview,
	});
	logSetPlansContext({ ctx, billingContext });
	await handleSetPlansErrors({ ctx, billingContext, params, preview });

	const { autumnBillingPlan, phases, immediatePhaseTransition } =
		computeSetPlansPlan({ ctx, billingContext });
	logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });
	await handleSetPlansComputeErrors({
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

	const stripeBillingPlan = {
		...(await evaluateStripeBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
			checkoutMode: billingContext.checkoutMode,
		})),
		replacedSubscriptionAction: billingContext.skipBillingChanges
			? undefined
			: buildReplacedSubscriptionAction({
					replacedStripeSubscription: billingContext.replacedStripeSubscription,
				}),
	};
	logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

	const billingPlan: BillingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlan,
	};

	handleSetPlansBillingPlanErrors({ ctx, billingContext, billingPlan });

	const result: SetPlansResult = {
		billingContext,
		billingPlan,
		schedulePlan: { phases, immediatePhaseTransition },
	};

	if (preview) {
		billingPlan.preview = await computeAttachPreviewBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});
		return result;
	}

	if (!skipAutumnCheckout) {
		const cachedResult = await checkCheckoutSessionLock({
			ctx,
			params,
			billingContext,
			billingPlan,
			existingLock: checkoutReservation,
		});

		if (cachedResult?.billingResult) {
			return { ...result, billingResult: cachedResult.billingResult };
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

		return { ...result, billingResult };
	}

	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan,
		checkoutLockParamsHash: !skipAutumnCheckout
			? hashJson({ value: params })
			: undefined,
	});
	logStripeBillingResult({ ctx, result: billingResult.stripe });

	// Checkout completion owns the schedule when execution is deferred or no
	// Stripe subscription exists yet.
	const scheduleDeferredToCheckout =
		billingResult.stripe.deferred ||
		(billingContext.enablePlanImmediately &&
			billingContext.checkoutMode === "stripe_checkout");

	if (scheduleDeferredToCheckout) {
		return { ...result, billingResult };
	}

	const persistedSchedule = await persistSetPlansSchedule({
		ctx,
		customerId: params.customer_id,
		currentEpochMs: billingContext.currentEpochMs,
		fullCustomer: billingContext.fullCustomer,
		phases,
		preservedCustomerProductIds: findOutOfScopeCustomerProductIds({
			billingContext,
		}),
	});

	return { ...result, billingResult, persistedSchedule };
};
