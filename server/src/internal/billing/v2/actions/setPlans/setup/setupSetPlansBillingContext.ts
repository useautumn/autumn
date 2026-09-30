import {
	type CreateScheduleBillingContext,
	isPastStartDate,
	type SetPlansParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupReplacedScheduleCustomerProductIds } from "@/internal/customers/schedules/setup/setupReplacedScheduleCustomerProductIds";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";
import { FIRST_PHASE_TOLERANCE_MS } from "../errors/handleFirstPhaseStartDateErrors";
import {
	getInitialSetPlansPhase,
	normalizeSetPlansPhases,
	phaseHasNumericStart,
} from "../errors/normalizeSetPlansPhases";
import { alignPhasesToScheduledStarts } from "./alignPhasesToScheduledStarts";
import { mergeScheduledPhaseCustomizations } from "./mergeScheduledPhaseCustomizations";
import { phaseToImmediateParams } from "./phaseToImmediateParams";
import { setupKeptSubscriptionCycle } from "./setupKeptSubscriptionCycle";
import { setupScheduledProductsContext } from "./setupScheduledProductsContext";
import { setupSetPlansBillingCycleAnchor } from "./setupSetPlansBillingCycleAnchor";
import { setupSetPlansCheckoutMode } from "./setupSetPlansCheckoutMode";
import { setupSetPlansCycleBoundaryMs } from "./setupSetPlansCycleBoundaryMs";
import {
	SET_PLANS_IMMEDIATE_SETUP_OPTIONS,
	setupSetPlansImmediatePhase,
} from "./setupSetPlansImmediatePhase";

export const setupSetPlansBillingContext = async ({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: SetPlansParamsV0;
	preview?: boolean;
}): Promise<CreateScheduleBillingContext> => {
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

	const normalizedPhases = alignPhasesToScheduledStarts({
		phases: normalizeSetPlansPhases({
			phases: params.phases,
			currentEpochMs: initialBillingContext.currentEpochMs,
			cycleBoundaryMs: setupSetPlansCycleBoundaryMs({
				billingContext: initialBillingContext,
				params,
			}),
		}),
		fullCustomer: initialBillingContext.fullCustomer,
	});

	const { billingContext, immediatePhase, futurePhases } =
		await setupSetPlansImmediatePhase({
			ctx,
			params,
			preview,
			billingContext: initialBillingContext,
			normalizedPhases,
		});

	const scheduledPhaseContexts = await setupScheduledProductsContext({
		ctx,
		phases: futurePhases,
		fullCustomer: billingContext.fullCustomer,
		currentEpochMs: billingContext.currentEpochMs,
		immediatePhaseProductContexts: billingContext.productContexts,
		endsAt: params.ends_at,
	});

	const replacedScheduleCustomerProductIds =
		await setupReplacedScheduleCustomerProductIds({
			ctx,
			internalCustomerId: billingContext.fullCustomer.internal_id,
		});

	const scheduleBillingContext: CreateScheduleBillingContext = {
		...billingContext,
		...mergeScheduledPhaseCustomizations({
			billingContext,
			scheduledPhaseContexts,
		}),
		replacedScheduleCustomerProductIds,
		checkoutMode: setupSetPlansCheckoutMode({
			billingContext,
			redirectMode: params.redirect_mode,
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
	};

	const keptCycleBillingContext: CreateScheduleBillingContext = {
		...scheduleBillingContext,
		...setupKeptSubscriptionCycle({
			ctx,
			billingContext: scheduleBillingContext,
			requestedProrationBehavior: params.proration_behavior,
		}),
	};

	return {
		...keptCycleBillingContext,
		...setupSetPlansBillingCycleAnchor({
			billingContext: keptCycleBillingContext,
			params,
		}),
	};
};
