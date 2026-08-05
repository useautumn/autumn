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
	// Ungrouped plans share a group key, so an exact plan match wins before it.
	const openingPlan =
		openingPhasePlans.find((plan) => plan.productId === productId) ??
		openingPhasePlans.find(
			(plan) =>
				plan.productId &&
				getProductGroupKey({ productId: plan.productId, products }) ===
					groupKey,
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

/** Scoped plans the phase doesn't already hold at that same scope. */
function unheldPlansAtScope({
	existingPlans,
	phasePlans,
	entityId,
}: {
	existingPlans: SchedulePlan[];
	phasePlans: SchedulePlan[];
	entityId: string | null;
}): SchedulePlan[] {
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
	existingPlans: SchedulePlan[];
	phasePlans: SchedulePlan[];
	entityId: string | null;
}): {
	entityId: string | null;
	plans: SchedulePlan[];
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
	plans: SchedulePlan[];
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
	phases: SchedulePhase[];
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
