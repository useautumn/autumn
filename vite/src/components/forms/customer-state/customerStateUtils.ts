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

/** The same plan in the phase before, preferring one at the same scope. Its
 * scope is copied along with the rest of the row. */
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

/** Plans sitting at exactly one scope — null is customer-level. */
export function filterPlansByScope({
	plans,
	entityId,
}: {
	plans: CustomerStatePlan[];
	entityId: string | null;
}): CustomerStatePlan[] {
	return plans.filter((plan) =>
		isSameScope({ entityId: plan.entityId, otherEntityId: entityId }),
	);
}

/** Scoped plans the phase doesn't already hold at that same scope. */
function unheldPlansAtScope({
	existingPlans,
	phasePlans,
	entityId,
}: {
	existingPlans: CustomerStatePlan[];
	phasePlans: CustomerStatePlan[];
	entityId: string | null;
}): CustomerStatePlan[] {
	const held = new Set(
		filterPlansByScope({ plans: phasePlans, entityId }).map(
			(plan) => plan.productId,
		),
	);
	return filterPlansByScope({ plans: existingPlans, entityId }).filter(
		(plan) => !held.has(plan.productId),
	);
}

/**
 * What "copy existing plans" pulls in, or null when the phase already holds it
 * all. Customer level falls back to the first entity holding plans, so the offer
 * stands even for a customer whose plans all sit on entities.
 */
export function resolveCopySourceScope({
	existingPlans,
	phasePlans,
	entityId,
}: {
	existingPlans: CustomerStatePlan[];
	phasePlans: CustomerStatePlan[];
	entityId: string | null;
}): {
	entityId: string | null;
	plans: CustomerStatePlan[];
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

/**
 * An unscheduled plan conflicts with any phase that claims its group and scope,
 * so every phase counts as used.
 */
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

/** The longest period a phase's plans bill on, or null when nothing recurs. */
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

/**
 * Default start for a phase added after `afterIndex`: one billing period of the
 * preceding phase's longest-running plan. Null when nothing there recurs, the
 * date lands in the past, or it would overrun the following phase.
 */
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

	// Only the opening phase runs from now when it carries no date of its own.
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

/** Every unarchived plan's group is already claimed at customer level. */
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
