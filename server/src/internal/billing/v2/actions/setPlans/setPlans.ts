import {
	type BillingPlan,
	CheckoutAction,
	type CreateScheduleBillingContext,
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
import { carryReplacedSubscriptionSettings } from "./setup/carryReplacedSubscription/carryReplacedSubscriptionSettings";
import { setupSetPlansBillingContext } from "./setup/setupSetPlansBillingContext";
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
	// Explicit, so a checkout that resumes these params keeps the same policy.
	const resolvedParams: SetPlansParamsV0 = {
		...params,
		undeclared_plans: params.undeclared_plans ?? "end",
	};
	const checkoutReservation =
		!preview && !skipAutumnCheckout
			? await checkoutSessionLock.get({ ctx, customerId: params.customer_id })
			: undefined;

	const { billingContext: plannedBillingContext, timeline } =
		await setupSetPlansBillingContext({
			ctx,
			params: resolvedParams,
			preview,
		});
	logSetPlansContext({ ctx, billingContext: plannedBillingContext, timeline });
	await handleSetPlansErrors({
		ctx,
		billingContext: plannedBillingContext,
		timeline,
		params: resolvedParams,
		preview,
	});

	const {
		autumnBillingPlan,
		phases,
		immediatePhaseTransition,
		customerProductChanges,
	} = computeSetPlansPlan({
		ctx,
		billingContext: plannedBillingContext,
		timeline,
	});
	logAutumnBillingPlan({
		ctx,
		plan: autumnBillingPlan,
		billingContext: plannedBillingContext,
	});
	await handleSetPlansComputeErrors({
		ctx,
		billingContext: plannedBillingContext,
		params: resolvedParams,
		autumnBillingPlan,
		immediatePhaseTransition,
	});

	if (!preview) {
		await ensureFreePhaseStripeProducts({
			ctx,
			billingContext: plannedBillingContext,
			autumnBillingPlan,
		});
	}

	const billingContext: CreateScheduleBillingContext = {
		...plannedBillingContext,
		...(await carryReplacedSubscriptionSettings({
			ctx,
			billingContext: plannedBillingContext,
			preview,
		})),
	};

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
					subscriptionBackdateStartMs:
						billingContext.subscriptionBackdateStartMs,
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
		timeline,
		schedulePlan: { phases, immediatePhaseTransition, customerProductChanges },
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
			params: resolvedParams,
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
			params: resolvedParams,
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
			? hashJson({ value: resolvedParams })
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
		preservedCustomerProductIds: timeline.outOfScopeCustomerProductIds,
	});

	return { ...result, billingResult, persistedSchedule };
};
