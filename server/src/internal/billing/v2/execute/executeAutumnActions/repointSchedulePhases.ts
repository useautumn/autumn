import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeSchedulePhaseReplacements } from "@/internal/billing/v2/compute/computeSchedulePhaseReplacements";
import { replaceScheduledPhaseCustomerProductIds } from "@/internal/customers/schedules/repos/replaceScheduledPhaseCustomerProductIds";

/** Derived here rather than per action: every flow that swaps a customer product funnels through the plan, and phases hold raw ids. */
export const repointSchedulePhases = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<void> => {
	await replaceScheduledPhaseCustomerProductIds({
		ctx,
		replacements: [
			...(autumnBillingPlan.schedulePhaseCustomerProductReplacements ?? []),
			...(autumnBillingPlan.ownsSchedulePersistence
				? []
				: computeSchedulePhaseReplacements({ autumnBillingPlan })),
		],
	});
};
