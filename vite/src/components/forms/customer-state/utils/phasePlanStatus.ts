import type {
	CustomerStatePhase,
	CustomerStatePlan,
} from "@/components/forms/customer-state/customerStateSchema";

export type PhasePlanStatus = "starts" | "kept";

type PlanScope = Pick<CustomerStatePlan, "productId" | "entityId">;

const planScopeKey = ({ productId, entityId }: PlanScope) =>
	`${productId}:${entityId ?? ""}`;

const hasSelectedProduct = (plan: CustomerStatePlan) => plan.productId !== "";

/** Phase one follows the customer's current plans; every later phase follows the one before. */
const findBaselinePlans = ({
	phases,
	phaseIndex,
	existingPlans,
}: {
	phases: CustomerStatePhase[];
	phaseIndex: number;
	existingPlans: CustomerStatePlan[];
}) =>
	phaseIndex === 0 ? existingPlans : (phases[phaseIndex - 1]?.plans ?? []);

const uniqueByScope = (plans: CustomerStatePlan[]) => [
	...new Map(plans.map((plan) => [planScopeKey(plan), plan])).values(),
];

/**
 * Each declared plan's status against the phase before, plus the baseline plans this
 * phase drops. Ongoing plans run through every phase, so they never read as ending.
 */
export const derivePhasePlanChanges = ({
	phases,
	phaseIndex,
	existingPlans,
	ongoingPlans,
}: {
	phases: CustomerStatePhase[];
	phaseIndex: number;
	existingPlans: CustomerStatePlan[];
	ongoingPlans: CustomerStatePlan[];
}): {
	statuses: (PhasePlanStatus | null)[];
	endingPlans: CustomerStatePlan[];
} => {
	const plans = phases[phaseIndex]?.plans ?? [];
	const baselinePlans = findBaselinePlans({
		phases,
		phaseIndex,
		existingPlans,
	}).filter(hasSelectedProduct);
	const baselineKeys = new Set(baselinePlans.map(planScopeKey));
	const continuingKeys = new Set([...plans, ...ongoingPlans].map(planScopeKey));

	return {
		statuses: plans.map((plan) => {
			if (!hasSelectedProduct(plan)) return null;
			return baselineKeys.has(planScopeKey(plan)) ? "kept" : "starts";
		}),
		endingPlans: uniqueByScope(
			baselinePlans.filter((plan) => !continuingKeys.has(planScopeKey(plan))),
		),
	};
};
