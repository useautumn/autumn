import {
	ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	type EntInterval,
	type FullCusEntWithFullCusProduct,
	getUsageWindowBounds,
	pickAllocationParent,
	type UsageWindow,
} from "@autumn/shared";

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
	pinnedId,
}: {
	sharedRows: FullCusEntWithFullCusProduct[];
	interval: EntInterval;
	now: number;
	pinnedId?: string | null;
}) => {
	const parent = pickAllocationParent({ sharedRows, pinnedId });
	if (!parent?.next_reset_at) return null;
	const bounds = getUsageWindowBounds({
		interval,
		now,
		anchor: parent.next_reset_at,
	});
	return { parentId: parent.id, ...bounds };
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
