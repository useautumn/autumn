import type { BillingContext, PhaseProrationBehavior } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
import { requestedAnchorResetProration } from "@/internal/billing/v2/utils/schedulePhaseProration/requestedAnchorResetProration";
import { listSchedulePhaseProrations } from "@/internal/customers/schedules/repos/listSchedulePhaseProrations";

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

/** set_plans names each phase's proration; any other action names its anchor reset's and keeps what the saved schedule holds. */
export const resolveSchedulePhaseProrations = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}): Promise<SchedulePhaseProration[]> => {
	const setPlansProrations = setPlansPhaseProrations({ billingContext });
	if (setPlansProrations) return setPlansProrations;

	const anchorResetProrations = requestedAnchorResetProration({
		billingContext,
	});
	if (!billingContext.stripeSubscriptionSchedule) return anchorResetProrations;

	// The request's anchor reset wins over a saved phase starting at the same time.
	return [
		...anchorResetProrations,
		...(await listSchedulePhaseProrations({
			ctx,
			internalCustomerId: billingContext.fullCustomer.internal_id,
		})),
	];
};
