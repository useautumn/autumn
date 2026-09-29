import type {
	MultiAttachBillingContext,
	SetPlansParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";
import { FIRST_PHASE_TOLERANCE_MS } from "../errors/handleFirstPhaseStartDateErrors";
import type { normalizeSetPlansPhases } from "../errors/normalizeSetPlansPhases";
import { isExistingScheduleUpdate } from "../utils/isExistingScheduleUpdate";
import { markUnscheduledProductContexts } from "../utils/unscheduledProductContexts";
import { getCurrentSetPlansPhaseIndex } from "./getCurrentSetPlansPhaseIndex";
import { phaseToImmediateParams } from "./phaseToImmediateParams";

/** The phase that bills now, its billing context, and the phases after it. */
export const setupSetPlansImmediatePhase = async ({
	ctx,
	params,
	preview,
	billingContext,
	normalizedPhases,
}: {
	ctx: AutumnContext;
	params: SetPlansParamsV0;
	preview: boolean;
	billingContext: MultiAttachBillingContext;
	normalizedPhases: ReturnType<typeof normalizeSetPlansPhases>;
}) => {
	const immediatePhaseIndex = isExistingScheduleUpdate({ billingContext })
		? getCurrentSetPlansPhaseIndex({
				phases: normalizedPhases,
				currentEpochMs: billingContext.currentEpochMs,
			})
		: 0;
	const immediatePhase = normalizedPhases[immediatePhaseIndex]!;

	// The opening phase already built the context passed in; a later phase has to
	// rebuild it against its own plans.
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
					billingStartsAtToleranceMs: FIRST_PHASE_TOLERANCE_MS,
					includeScheduledProductsForScheduleLookup: true,
					replaceUnusableSubscription: true,
					inheritSubscriptionTrial: true,
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
