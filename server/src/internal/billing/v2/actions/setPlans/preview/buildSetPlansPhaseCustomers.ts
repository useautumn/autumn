import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { applySchedulePhaseToFullCustomer } from "./applySchedulePhaseToFullCustomer";

export const buildSetPlansPhaseCustomers = ({
	ctx,
	fullCustomer,
	autumnBillingPlan,
	phases,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
}): FullCustomer[] => {
	const phaseCustomers = [
		applyAutumnBillingPlanToFullCustomer({ fullCustomer, autumnBillingPlan }),
	];

	for (const phase of phases.slice(1)) {
		const previousCustomer = phaseCustomers[phaseCustomers.length - 1];
		phaseCustomers.push(
			applySchedulePhaseToFullCustomer({
				ctx,
				fullCustomer: previousCustomer,
				phase,
			}),
		);
	}

	return phaseCustomers;
};
