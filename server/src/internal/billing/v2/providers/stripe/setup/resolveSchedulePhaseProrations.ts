import type { BillingContext, PhaseProrationBehavior } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
import { requestedAnchorResetProration } from "@/internal/billing/v2/utils/schedulePhaseProration/requestedAnchorResetProration";
import { listSchedulePhaseProrations } from "@/internal/customers/schedules/repos/listSchedulePhaseProrations";
import { liveScheduleAnchorResetProrations } from "./liveScheduleAnchorResetProrations";

export type SchedulePhaseProration = {
	startsAt: number;
	prorationBehavior: PhaseProrationBehavior;
};

/** The phase prorations a set_plans request names; undefined for any other action. */
export const setPlansPhaseProrations = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): SchedulePhaseProration[] | undefined => {
	if (!isSetPlansBillingContext(billingContext)) return undefined;

	const laterPhaseProrations = billingContext.scheduledPhaseContexts.flatMap(
		({ startsAt, prorationBehavior }) =>
			prorationBehavior ? [{ startsAt, prorationBehavior }] : [],
	);

	// A later phase starting on the anchor keeps its own proration, so it is listed first.
	return [
		...laterPhaseProrations,
		...requestedAnchorResetProration({ billingContext }),
	];
};

/** The prorations a request names: set_plans' phases, or any other action's anchor reset. */
export const requestedPhaseProrations = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): SchedulePhaseProration[] =>
	setPlansPhaseProrations({ billingContext }) ??
	requestedAnchorResetProration({ billingContext });

/**
 * The prorations a schedule rebuild applies, first match wins: set_plans' phases, or a saved phase
 * starting there, then the request's anchor reset, then the anchor reset the live Stripe schedule holds.
 */
export const resolveSchedulePhaseProrations = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}): Promise<SchedulePhaseProration[]> => {
	const liveResetProrations = liveScheduleAnchorResetProrations({
		billingContext,
	});

	const setPlansProrations = setPlansPhaseProrations({ billingContext });
	if (setPlansProrations)
		return [...setPlansProrations, ...liveResetProrations];

	const savedPhaseProrations = billingContext.stripeSubscriptionSchedule
		? await listSchedulePhaseProrations({
				ctx,
				internalCustomerId: billingContext.fullCustomer.internal_id,
			})
		: [];
	return [
		...savedPhaseProrations,
		...requestedAnchorResetProration({ billingContext }),
		...liveResetProrations,
	];
};
