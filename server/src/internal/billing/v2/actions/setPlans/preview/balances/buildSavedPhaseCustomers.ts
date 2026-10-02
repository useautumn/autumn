import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { buildSetPlansPhaseCustomers } from "../buildSetPlansPhaseCustomers";
import { savedSchedulePhases } from "./savedSchedulePhases";
import { withOneOffPrepaidCarryOvers } from "./withOneOffPrepaidCarryOvers";

/** The customer at each saved phase date (all after now) had the request never been sent. */
export const buildSavedPhaseCustomers = ({
	ctx,
	fullCustomer,
	autumnBillingPlan,
	phases,
	dates,
	now,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
	dates: number[];
	now: number;
}): Map<number, FullCustomer> => {
	if (phases.length === 0 || dates.length === 0) return new Map();

	const savedPhases = savedSchedulePhases({
		fullCustomer,
		phases,
		autumnBillingPlan,
		dates: [now, ...dates],
	});
	const savedPhaseCustomers = buildSetPlansPhaseCustomers({
		ctx,
		fullCustomer,
		autumnBillingPlan: {
			customerId: autumnBillingPlan.customerId,
			insertCustomerProducts: [],
		},
		phases: savedPhases,
	});
	const savedCustomers = withOneOffPrepaidCarryOvers({
		originalFullCustomer: fullCustomer,
		phaseCustomers: savedPhaseCustomers,
	});
	const savedCustomerAt = (at: number) =>
		savedCustomers[savedPhases.findIndex(({ startsAt }) => startsAt === at)];
	return new Map(dates.map((at) => [at, savedCustomerAt(at) ?? fullCustomer]));
};
