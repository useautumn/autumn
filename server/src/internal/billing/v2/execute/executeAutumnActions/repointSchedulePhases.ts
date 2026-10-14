import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeSchedulePhaseReplacements } from "@/internal/billing/v2/compute/computeSchedulePhaseReplacements";
import { replaceScheduledPhaseCustomerProductIds } from "@/internal/customers/schedules/repos/replaceScheduledPhaseCustomerProductIds";

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
