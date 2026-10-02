import type {
	MultiAttachBillingContext,
	SetPlansParamsV0,
	StripeSubscriptionScope,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";
import type { normalizeSetPlansPhases } from "../errors/normalizeSetPlansPhases";
import { isExistingScheduleUpdate } from "../utils/isExistingScheduleUpdate";
import { markUnscheduledProductContexts } from "../utils/unscheduledProductContexts";
import { FIRST_PHASE_TOLERANCE_MS } from "./classifyFirstPhaseStart";
import { getCurrentSetPlansPhaseIndex } from "./getCurrentSetPlansPhaseIndex";
import { phaseToImmediateParams } from "./phaseToImmediateParams";

export const SET_PLANS_IMMEDIATE_SETUP_OPTIONS = {
	billingStartsAtToleranceMs: FIRST_PHASE_TOLERANCE_MS,
	includeScheduledProductsForScheduleLookup: true,
	replaceUnusableSubscription: true,
	inheritSubscriptionTrial: true,
} as const;

export const setupSetPlansImmediatePhase = async ({
	ctx,
	params,
	preview,
	billingContext,
	normalizedPhases,
	stripeSubscriptionScope,
}: {
	ctx: AutumnContext;
	params: SetPlansParamsV0;
	preview: boolean;
	billingContext: MultiAttachBillingContext;
	normalizedPhases: ReturnType<typeof normalizeSetPlansPhases>;
	stripeSubscriptionScope?: StripeSubscriptionScope;
}) => {
	const immediatePhaseIndex = isExistingScheduleUpdate({
		billingContext: { ...billingContext, stripeSubscriptionScope },
	})
		? getCurrentSetPlansPhaseIndex({
				phases: normalizedPhases,
				currentEpochMs: billingContext.currentEpochMs,
			})
		: 0;
	const immediatePhase = normalizedPhases[immediatePhaseIndex];
	if (!immediatePhase) {
		throw new Error(`set_plans has no phase at index ${immediatePhaseIndex}`);
	}

	const immediateBillingContext =
		immediatePhaseIndex === 0
			? billingContext
			: await setupImmediateMultiProductBillingContext({
					ctx,
					params: phaseToImmediateParams({
						ctx,
						params,
						phase: immediatePhase,
					}),
					preview,
					billingStartsAt: immediatePhase.starts_at,
					...SET_PLANS_IMMEDIATE_SETUP_OPTIONS,
				});

	return {
		billingContext: markUnscheduledProductContexts({
			billingContext: immediateBillingContext,
			unscheduledPlanCount: params.unscheduled_plans?.length ?? 0,
		}),
		immediatePhase,
		futurePhases: normalizedPhases.slice(immediatePhaseIndex + 1),
	};
};
