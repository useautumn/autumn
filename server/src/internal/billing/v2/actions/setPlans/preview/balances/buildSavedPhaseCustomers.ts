import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { buildSetPlansPhaseCustomers } from "../buildSetPlansPhaseCustomers";
import { savedSchedulePhases } from "./savedSchedulePhases";

/** The customer at each request phase start had the request never been sent. */
export const buildSavedPhaseCustomers = ({
	ctx,
	fullCustomer,
	autumnBillingPlan,
	phases,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
}): FullCustomer[] =>
	buildSetPlansPhaseCustomers({
		ctx,
		fullCustomer,
		autumnBillingPlan: {
			customerId: autumnBillingPlan.customerId,
			insertCustomerProducts: [],
		},
		phases: savedSchedulePhases({ fullCustomer, phases, autumnBillingPlan }),
	});
