import type { ProductV2 } from "@autumn/shared";
import {
	getProductGroupKey,
	getUsedProductGroupKeys,
} from "@/components/forms/shared/utils/planGroupUtils";
import type { SchedulePhase, SchedulePlan } from "./createScheduleFormSchema";

/**
 * Mirrors the server's inheritance rule: a later phase's plan takes the scope of
 * the opening phase's plan in the same group, else customer-level.
 */
export function resolveInheritedPlanScope({
	productId,
	openingPhasePlans,
	products,
}: {
	productId: string;
	openingPhasePlans: SchedulePlan[];
	products: ProductV2[];
}): string | undefined {
	if (!productId) return undefined;
	const groupKey = getProductGroupKey({ productId, products });
	const openingPlan = openingPhasePlans.find(
		(plan) =>
			plan.productId &&
			getProductGroupKey({ productId: plan.productId, products }) === groupKey,
	);
	return openingPlan?.entityId ?? undefined;
}

/** Plans sitting at exactly one scope — null is customer-level. */
export function filterPlansByScope({
	plans,
	entityId,
}: {
	plans: SchedulePlan[];
	entityId: string | null;
}): SchedulePlan[] {
	return plans.filter((plan) => (plan.entityId ?? null) === entityId);
}

/**
 * An unscheduled plan conflicts with any phase that claims its group and scope,
 * so every phase counts as used — later phases at the scope they inherit.
 */
export function getUnscheduledUsedGroupKeys({
	phases,
	unscheduledPlans,
	planIndex,
	products,
	entityId = null,
}: {
	phases: SchedulePhase[];
	unscheduledPlans: SchedulePlan[];
	planIndex: number;
	products: ProductV2[];
	entityId?: string | null;
}): Set<string> {
	const openingPhasePlans = phases[0]?.plans ?? [];
	const phasePlans = phases.flatMap((phase, index) =>
		index === 0
			? phase.plans
			: phase.plans.map((plan) => ({
					...plan,
					entityId:
						resolveInheritedPlanScope({
							productId: plan.productId,
							openingPhasePlans,
							products,
						}) ?? null,
				})),
	);

	return getUsedGroupKeys({
		plans: [
			...phasePlans,
			...unscheduledPlans.filter((_, index) => index !== planIndex),
		],
		products,
		entityId,
	});
}

/**
 * Group conflicts are per scope: the same plan may sit at customer level and on
 * an entity within one phase, so only same-scope plans count as used.
 */
export function getUsedGroupKeys({
	plans,
	products,
	excludePlanIndex,
	entityId = null,
}: {
	plans: SchedulePlan[];
	products: ProductV2[];
	excludePlanIndex?: number;
	entityId?: string | null;
}): Set<string> {
	return getUsedProductGroupKeys({
		productIds: plans.flatMap((plan, index) =>
			index === excludePlanIndex || (plan.entityId ?? null) !== entityId
				? []
				: [plan.productId],
		),
		products,
	});
}
