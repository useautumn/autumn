import type { CustomerPlanChange } from "@autumn/shared";
import { planChangePlanId } from "./planChangePlanId";
import type { ReviewPlan } from "./types/reviewChange";

type PlanMatcher = (params: {
	plan: ReviewPlan;
	change: CustomerPlanChange;
}) => boolean;

const matchesPlanId: PlanMatcher = ({ plan, change }) =>
	plan.planId === planChangePlanId(change);

const matchesPlanAndScope: PlanMatcher = ({ plan, change }) =>
	matchesPlanId({ plan, change }) &&
	plan.entityId === (change.entity_id ?? null);

/**
 * Pairs each continuing change with one declared plan: same entity scope first, then
 * by plan id alone, since later phases may leave scope unset. Ending plans aren't declared.
 */
export const matchPlanChangesToDeclaredPlans = ({
	changes,
	declaredPlans,
}: {
	changes: CustomerPlanChange[];
	declaredPlans: ReviewPlan[];
}) => {
	const unmatchedPlans = [...declaredPlans];
	const matchedPlans: (ReviewPlan | undefined)[] = changes.map(() => undefined);

	for (const matcher of [matchesPlanAndScope, matchesPlanId]) {
		for (const [changeIndex, change] of changes.entries()) {
			if (change.action === "expired" || matchedPlans[changeIndex]) continue;
			const planIndex = unmatchedPlans.findIndex((plan) =>
				matcher({ plan, change }),
			);
			if (planIndex < 0) continue;
			matchedPlans[changeIndex] = unmatchedPlans.splice(planIndex, 1)[0];
		}
	}

	return { matchedPlans, unmatchedPlans };
};
