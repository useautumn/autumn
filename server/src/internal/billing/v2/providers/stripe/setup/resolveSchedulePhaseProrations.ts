import type { BillingContext, PhaseProrationBehavior } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { firstPhaseAnchorResetProration } from "@/internal/billing/v2/actions/setPlans/utils/firstPhaseAnchorResetProration";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
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
		...firstPhaseAnchorResetProration({ billingContext }),
	];
};

/** set_plans names each later phase's proration; any other action keeps what the saved schedule holds. */
export const resolveSchedulePhaseProrations = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}): Promise<SchedulePhaseProration[]> => {
	const requestedPhaseProrations = setPlansPhaseProrations({ billingContext });
	if (requestedPhaseProrations) return requestedPhaseProrations;
	if (!billingContext.stripeSubscriptionSchedule) return [];

	return await listSchedulePhaseProrations({
		ctx,
		internalCustomerId: billingContext.fullCustomer.internal_id,
	});
};
