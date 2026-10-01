import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import type { ReviewPhaseMatches } from "../review/types/reviewPhase";
import { buildSavedPhaseCustomers } from "./buildSavedPhaseCustomers";

/** Per request phase, the saved customer it is matched with; undefined compares with the phase before. */
export const savedComparisonCustomers = ({
	ctx,
	fullCustomer,
	autumnBillingPlan,
	phases,
	matches,
	now,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
	matches: ReviewPhaseMatches;
	now: number;
}): (FullCustomer | undefined)[] => {
	const savedDateOf = ({ comparison }: ReviewPhaseMatches["phases"][number]) =>
		comparison.type === "saved" && comparison.at > now
			? comparison.at
			: undefined;
	const savedDates = matches.phases.flatMap((phase) => {
		const savedAt = savedDateOf(phase);
		return savedAt === undefined ? [] : [savedAt];
	});
	const savedCustomers = buildSavedPhaseCustomers({
		ctx,
		fullCustomer,
		autumnBillingPlan,
		phases,
		dates: [...new Set(savedDates)].sort((first, second) => first - second),
	});

	return matches.phases.map((phase) => {
		const savedAt = savedDateOf(phase);
		return savedAt === undefined ? undefined : savedCustomers.get(savedAt);
	});
};
