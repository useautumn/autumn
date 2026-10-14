import type { IntervalConfig, ProductItem, ProductV2 } from "@autumn/shared";
import {
	addBillingInterval,
	BillingInterval,
	intervalToValue,
	isFeaturePriceItem,
	isPriceItem,
	itemToBillingInterval,
	itemToBillingIntervalCount,
} from "@autumn/shared";
import type {
	CustomerStatePhase,
	CustomerStatePlan,
} from "@/components/forms/customer-state/customerStateSchema";
import {
	getProductGroupKey,
	getUsedProductGroupKeys,
} from "@/components/forms/shared/utils/planGroupUtils";

export function isSameScope({
	entityId,
	otherEntityId,
}: {
	entityId: string | null | undefined;
	otherEntityId: string | null | undefined;
}): boolean {
	return (entityId ?? null) === (otherEntityId ?? null);
}

export function filterUnarchivedProducts({
	products,
}: {
	products: ProductV2[];
}): ProductV2[] {
	return products.filter((product) => !product.archived);
}

export function getSiblingProductIds({
	plans,
	planIndex,
}: {
	plans: CustomerStatePlan[];
	planIndex: number;
}): Set<string> {
	return new Set(
		plans
			.filter((_, index) => index !== planIndex)
			.map((other) => other.productId)
			.filter(Boolean),
	);
}

export function findPreviousPhasePlan({
	phases,
	phaseIndex,
	plan,
}: {
	phases: { plans: CustomerStatePlan[] }[];
	phaseIndex: number;
	plan: CustomerStatePlan;
}): CustomerStatePlan | undefined {
	const candidates =
		phases[phaseIndex - 1]?.plans.filter(
			(previous) => previous.productId === plan.productId,
		) ?? [];
	return (
		candidates.find((previous) =>
			isSameScope({
				entityId: previous.entityId,
				otherEntityId: plan.entityId,
			}),
		) ?? candidates[0]
	);
}

type ScopedPlan = Pick<CustomerStatePlan, "productId" | "entityId">;

export function filterPlansByScope<T extends ScopedPlan>({
	plans,
	entityId,
}: {
	plans: T[];
	entityId: string | null;
}): T[] {
	return plans.filter((plan) =>
		isSameScope({ entityId: plan.entityId, otherEntityId: entityId }),
	);
}

function unheldPlansAtScope<T extends ScopedPlan>({
	existingPlans,
	phasePlans,
	entityId,
}: {
	existingPlans: T[];
	phasePlans: ScopedPlan[];
	entityId: string | null;
}): T[] {
	const held = new Set(
		filterPlansByScope({ plans: phasePlans, entityId }).map(
			(plan) => plan.productId,
		),
	);
	return filterPlansByScope({ plans: existingPlans, entityId }).filter(
		(plan) => !held.has(plan.productId),
	);
}

export function resolveCopySourceScope<T extends ScopedPlan>({
	existingPlans,
	phasePlans,
	entityId,
}: {
	existingPlans: T[];
	phasePlans: ScopedPlan[];
	entityId: string | null;
}): {
	entityId: string | null;
	plans: T[];
	isFallback: boolean;
} | null {
	const scopedPlans = unheldPlansAtScope({
		existingPlans,
		phasePlans,
		entityId,
	});
	if (scopedPlans.length > 0) {
		return { entityId, plans: scopedPlans, isFallback: false };
	}
	if (entityId !== null) return null;

	const fallbackEntityId = existingPlans.find(
		(plan) => plan.entityId,
	)?.entityId;
	if (!fallbackEntityId) return null;

	const fallbackPlans = unheldPlansAtScope({
		existingPlans,
		phasePlans,
		entityId: fallbackEntityId,
	});
	if (fallbackPlans.length === 0) return null;
	return { entityId: fallbackEntityId, plans: fallbackPlans, isFallback: true };
}

export function getUnscheduledUsedGroupKeys({
	phases,
	unscheduledPlans,
	planIndex,
	products,
	entityId = null,
}: {
	phases: CustomerStatePhase[];
	unscheduledPlans: CustomerStatePlan[];
	planIndex: number;
	products: ProductV2[];
	entityId?: string | null;
}): Set<string> {
	return getUsedGroupKeys({
		plans: [
			...phases.flatMap((phase) => phase.plans),
			...unscheduledPlans.filter((_, index) => index !== planIndex),
		],
		products,
		entityId,
	});
}

const priceItemToIntervalConfig = ({
	item,
}: {
	item: ProductItem;
}): IntervalConfig | null => {
	if (!(isPriceItem(item) || isFeaturePriceItem(item))) return null;

	const interval = itemToBillingInterval({ item });
	if (interval === BillingInterval.OneOff) return null;

	return { interval, intervalCount: itemToBillingIntervalCount({ item }) };
};

function findPhaseBillingInterval({
	plans,
	products,
}: {
	plans: CustomerStatePlan[];
	products: ProductV2[];
}): IntervalConfig | null {
	let longest: IntervalConfig | null = null;

	for (const plan of plans) {
		const items =
			plan.items ??
			products.find((product) => product.id === plan.productId)?.items;

		for (const item of items ?? []) {
			const config = priceItemToIntervalConfig({ item });
			if (!config) continue;
			if (
				!longest ||
				intervalToValue(config.interval, config.intervalCount) >
					intervalToValue(longest.interval, longest.intervalCount)
			) {
				longest = config;
			}
		}
	}

	return longest;
}

export function resolveNextPhaseStartsAt({
	phases,
	afterIndex,
	products,
	nowMs,
}: {
	phases: CustomerStatePhase[];
	afterIndex: number;
	products: ProductV2[];
	nowMs: number;
}): number | null {
	const previousPhase = phases[afterIndex];
	if (!previousPhase) return null;

	const startsAt = previousPhase.startsAt ?? (afterIndex === 0 ? nowMs : null);
	if (startsAt === null) return null;

	const intervalConfig = findPhaseBillingInterval({
		plans: previousPhase.plans,
		products,
	});
	if (!intervalConfig) return null;

	const nextStartsAt = addBillingInterval({
		fromUnix: startsAt,
		intervalConfig,
	});
	if (nextStartsAt <= nowMs) return null;

	const followingStartsAt = phases[afterIndex + 1]?.startsAt;
	if (followingStartsAt != null && nextStartsAt >= followingStartsAt) {
		return null;
	}

	return nextStartsAt;
}

export function getUsedGroupKeys({
	plans,
	products,
	excludePlanIndex,
	entityId = null,
}: {
	plans: CustomerStatePlan[];
	products: ProductV2[];
	excludePlanIndex?: number;
	entityId?: string | null;
}): Set<string> {
	return getUsedProductGroupKeys({
		productIds: plans.flatMap((plan, index) =>
			index === excludePlanIndex ||
			!isSameScope({ entityId: plan.entityId, otherEntityId: entityId })
				? []
				: [plan.productId],
		),
		products,
	});
}

export function areAllPlansAdded({
	plans,
	products,
}: {
	plans: CustomerStatePlan[];
	products: ProductV2[];
}): boolean {
	const usedKeys = getUsedGroupKeys({ plans, products });
	return filterUnarchivedProducts({ products }).every((product) =>
		usedKeys.has(getProductGroupKey({ productId: product.id, products })),
	);
}
