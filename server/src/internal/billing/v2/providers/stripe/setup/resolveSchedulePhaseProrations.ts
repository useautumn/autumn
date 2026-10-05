import type { BillingContext, PhaseProrationBehavior } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
import { listSchedulePhaseProrations } from "@/internal/customers/schedules/repos/listSchedulePhaseProrations";

export type SchedulePhaseProration = {
	startsAt: number;
	prorationBehavior: PhaseProrationBehavior;
};

/** set_plans names each later phase's proration; any other action keeps what the saved schedule holds. */
export const resolveSchedulePhaseProrations = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}): Promise<SchedulePhaseProration[]> => {
	if (isSetPlansBillingContext(billingContext)) {
		return billingContext.scheduledPhaseContexts.flatMap(
			({ startsAt, prorationBehavior }) =>
				prorationBehavior ? [{ startsAt, prorationBehavior }] : [],
		);
	}
	if (!billingContext.stripeSubscriptionSchedule) return [];

	return await listSchedulePhaseProrations({
		ctx,
		internalCustomerId: billingContext.fullCustomer.internal_id,
	});
};
