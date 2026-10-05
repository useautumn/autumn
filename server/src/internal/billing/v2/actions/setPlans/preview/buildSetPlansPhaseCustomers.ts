import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { applySchedulePhaseToFullCustomer } from "./applySchedulePhaseToFullCustomer";

export const buildSetPlansPhaseCustomers = ({
	ctx,
	fullCustomer,
	autumnBillingPlan,
	phases,
	firstPhaseStartsLater = false,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
	firstPhaseStartsLater?: boolean;
}): FullCustomer[] => {
	const billedCustomer = applyAutumnBillingPlanToFullCustomer({
		fullCustomer,
		autumnBillingPlan,
	});
	const [firstPhase] = phases;
	const phaseCustomers = [
		firstPhaseStartsLater && firstPhase
			? applySchedulePhaseToFullCustomer({
					ctx,
					fullCustomer: billedCustomer,
					phase: firstPhase,
				})
			: billedCustomer,
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
