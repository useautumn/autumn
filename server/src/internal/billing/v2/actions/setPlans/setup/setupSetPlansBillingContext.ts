import {
	type CreateScheduleBillingContext,
	isPastStartDate,
	type SetPlansParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";
import {
	getInitialSetPlansPhase,
	normalizeSetPlansPhases,
	phaseHasNumericStart,
} from "../errors/normalizeSetPlansPhases";
import { filterCustomerProductsInStripeSubscriptionScope } from "../subscriptionScope/isCustomerProductInStripeSubscriptionScope";
import { setupStripeSubscriptionScope } from "../subscriptionScope/setupStripeSubscriptionScope";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { alignPhasesToSavedBoundaries } from "./alignPhasesToSavedBoundaries";
import {
	classifyFirstPhaseStart,
	FIRST_PHASE_TOLERANCE_MS,
	firstPhaseStartsInFuture,
} from "./classifyFirstPhaseStart";
import { mergeScheduledPhaseCustomizations } from "./mergeScheduledPhaseCustomizations";
import { phaseToImmediateParams } from "./phaseToImmediateParams";
import { replaceLiveSubscriptionForBackdate } from "./replaceLiveSubscriptionForBackdate";
import { replaceLiveSubscriptionForFutureStart } from "./replaceLiveSubscriptionForFutureStart";
import { setupFutureStartTiming } from "./setupFutureStartTiming";
import { setupKeptSubscriptionCycle } from "./setupKeptSubscriptionCycle";
import { setupScheduledProductsContext } from "./setupScheduledProductsContext";
import { setupSetPlansBillingCycleAnchor } from "./setupSetPlansBillingCycleAnchor";
import { setupSetPlansCheckoutMode } from "./setupSetPlansCheckoutMode";
import { setupSetPlansCycleBoundaryMs } from "./setupSetPlansCycleBoundaryMs";
import {
	SET_PLANS_IMMEDIATE_SETUP_OPTIONS,
	setupSetPlansImmediatePhase,
} from "./setupSetPlansImmediatePhase";
import { setupSetPlansTimeline } from "./setupSetPlansTimeline";

export const setupSetPlansBillingContext = async ({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: SetPlansParamsV0;
	preview?: boolean;
}): Promise<{
	billingContext: CreateScheduleBillingContext;
	timeline: SetPlansTimeline;
}> => {
	const initialPhase = getInitialSetPlansPhase({ phases: params.phases });

	const initialBillingContext = await setupImmediateMultiProductBillingContext({
		ctx,
		params: phaseToImmediateParams({ ctx, params, phase: initialPhase }),
		preview,
		billingStartsAt: phaseHasNumericStart(initialPhase)
			? initialPhase.starts_at
			: undefined,
		...SET_PLANS_IMMEDIATE_SETUP_OPTIONS,
	});

	const initialPhaseStartsInFuture =
		phaseHasNumericStart(initialPhase) &&
		classifyFirstPhaseStart({
			startsAt: initialPhase.starts_at,
			currentEpochMs: initialBillingContext.currentEpochMs,
		}) === "future";

	const stripeSubscriptionScope = setupStripeSubscriptionScope({
		fullCustomer: initialBillingContext.fullCustomer,
		stripeSubscriptionId: params.stripe_subscription_id,
		stripeScheduleId: initialBillingContext.stripeSubscriptionSchedule?.id,
	});

	const normalizedPhases = alignPhasesToSavedBoundaries({
		phases: normalizeSetPlansPhases({
			phases: params.phases,
			currentEpochMs: initialBillingContext.currentEpochMs,
			cycleBoundaryMs: initialPhaseStartsInFuture
				? undefined
				: setupSetPlansCycleBoundaryMs({
						billingContext: initialBillingContext,
						params,
					}),
		}),
		customerProducts: filterCustomerProductsInStripeSubscriptionScope({
			stripeSubscriptionScope,
			customerProducts: initialBillingContext.fullCustomer.customer_products,
		}),
		currentEpochMs: initialBillingContext.currentEpochMs,
	});

	const {
		billingContext: immediateBillingContext,
		immediatePhase,
		futurePhases,
	} = await setupSetPlansImmediatePhase({
		ctx,
		params,
		preview,
		billingContext: initialBillingContext,
		normalizedPhases,
		stripeSubscriptionScope,
	});
	const billingContext = {
		...immediateBillingContext,
		...replaceLiveSubscriptionForBackdate({
			billingContext: immediateBillingContext,
			immediatePhase,
			stripeSubscriptionScope,
		}),
	};

	const firstPhaseContext = {
		immediatePhase,
		currentEpochMs: billingContext.currentEpochMs,
	};

	const scheduledPhaseContexts = await setupScheduledProductsContext({
		ctx,
		phases: futurePhases,
		fullCustomer: billingContext.fullCustomer,
		currentEpochMs: billingContext.currentEpochMs,
		immediatePhaseProductContexts: billingContext.productContexts,
		endsAt: params.ends_at,
	});

	const scheduleBillingContext: CreateScheduleBillingContext = {
		...billingContext,
		...mergeScheduledPhaseCustomizations({
			billingContext,
			scheduledPhaseContexts,
		}),
		checkoutMode: setupSetPlansCheckoutMode({
			billingContext,
			redirectMode: params.redirect_mode,
			startsInFuture: firstPhaseStartsInFuture({
				billingContext: firstPhaseContext,
			}),
		}),
		requestedProrationBehavior: params.proration_behavior,
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
		billingStartsAt: immediatePhase.starts_at,
		subscriptionBackdateStartMs: isPastStartDate(
			immediatePhase.starts_at,
			billingContext.currentEpochMs,
			FIRST_PHASE_TOLERANCE_MS,
		)
			? immediatePhase.starts_at
			: undefined,
		immediatePhase,
		futurePhases,
		scheduledPhaseContexts,
		endsAt: params.ends_at,
		stripeSubscriptionScope,
		...setupFutureStartTiming({ billingContext: firstPhaseContext, params }),
	};

	const timeline = setupSetPlansTimeline({
		ctx,
		billingContext: scheduleBillingContext,
		params,
	});

	const liveSubscriptionBillingContext: CreateScheduleBillingContext = {
		...scheduleBillingContext,
		...replaceLiveSubscriptionForFutureStart({
			billingContext: scheduleBillingContext,
			operations: timeline.diff.operations,
		}),
	};

	const keptCycleBillingContext: CreateScheduleBillingContext = {
		...liveSubscriptionBillingContext,
		...setupKeptSubscriptionCycle({
			billingContext: liveSubscriptionBillingContext,
			timeline,
			requestedProrationBehavior: params.proration_behavior,
		}),
	};

	return {
		billingContext: {
			...keptCycleBillingContext,
			...setupSetPlansBillingCycleAnchor({
				billingContext: keptCycleBillingContext,
				timeline,
				params,
			}),
		},
		timeline,
	};
};
