import {
	ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	type BalanceAllocation,
	type EntInterval,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	getUsageWindowBounds,
	isSameUsageWindow,
	type UsageWindow,
} from "@autumn/shared";
import { pickAllocationParent } from "@autumn/shared";
import { Decimal } from "decimal.js";

const isCustomerLevel = (customerEntitlement: FullCusEntWithFullCusProduct) =>
	!customerEntitlement.internal_entity_id &&
	!customerEntitlement.customer_product?.internal_entity_id;

/** Customer-level rows for the feature on the interval: the credits allocations divide. */
export const sharedRowsOf = ({
	customerEntitlements,
	featureId,
	interval,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	featureId: string;
	interval: EntInterval;
}) =>
	customerEntitlements.filter(
		(customerEntitlement) =>
			isCustomerLevel(customerEntitlement) &&
			customerEntitlement.entitlement.feature.id === featureId &&
			customerEntitlement.entitlement.interval === interval,
	);

/** The current cycle's bounds, anchored to the parent row's reset. */
export const allocationCycleOf = ({
	sharedRows,
	interval,
	now,
}: {
	sharedRows: FullCusEntWithFullCusProduct[];
	interval: EntInterval;
	now: number;
}) => {
	const parent = pickAllocationParent({ sharedRows });
	if (!parent?.next_reset_at) return null;
	const bounds = getUsageWindowBounds({
		interval,
		now,
		anchor: parent.next_reset_at,
	});
	return { parentId: parent.id, ...bounds };
};

/** Live allocation counters, by internal entity id; the claimed total under null. */
export const allocationCounterUsage = ({
	fullSubject,
	allocation,
	cycle,
}: {
	fullSubject: FullSubject;
	allocation: Pick<BalanceAllocation, "feature_id">;
	cycle: { windowStartAt: number; windowEndAt: number };
}) => {
	const usage: Record<string, number> = {};
	for (const window of fullSubject.usage_windows ?? []) {
		if (
			window.feature_id !== allocation.feature_id ||
			window.filter_key !== ALLOCATION_USAGE_WINDOW_FILTER_KEY ||
			!isSameUsageWindow({
				usageWindow: window,
				window: {
					window_start_at: cycle.windowStartAt,
					window_end_at: cycle.windowEndAt,
				},
			})
		)
			continue;
		usage[window.internal_entity_id ?? ""] = new Decimal(window.usage).toNumber();
	}
	return usage;
};

export const toAllocationCounter = ({
	id,
	internalCustomerId,
	internalFeatureId,
	featureId,
	internalEntityId,
	cycle,
	usage,
	now,
}: {
	id: string;
	internalCustomerId: string;
	internalFeatureId: string;
	featureId: string;
	internalEntityId: string | null;
	cycle: { parentId: string; windowStartAt: number; windowEndAt: number };
	usage: number;
	now: number;
}): UsageWindow => ({
	id,
	internal_customer_id: internalCustomerId,
	internal_entity_id: internalEntityId,
	feature_id: featureId,
	internal_feature_id: internalFeatureId,
	filter_key: ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	anchor_customer_entitlement_id: cycle.parentId,
	window_start_at: cycle.windowStartAt,
	window_end_at: cycle.windowEndAt,
	usage,
	updated_at: now,
});
