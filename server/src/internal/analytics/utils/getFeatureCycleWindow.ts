import {
	customerEntitlementFundsFeature,
	EntInterval,
	type FullCusProduct,
	type FullCustomerEntitlement,
	getCycleEnd,
	getCycleStart,
} from "@autumn/shared";

export type FeatureCycleWindow = {
	start: number;
	end: number;
	createdAt: number;
};

const fundsAnyFeature = ({
	customerEntitlement,
	featureIds,
}: {
	customerEntitlement: FullCustomerEntitlement;
	featureIds: string[];
}) =>
	featureIds.some((featureId) =>
		customerEntitlementFundsFeature({ customerEntitlement, featureId }),
	);

const customerEntitlementToCycleWindow = ({
	customerEntitlement,
	now,
}: {
	customerEntitlement: FullCustomerEntitlement;
	now: number;
}): FeatureCycleWindow | null => {
	const { interval, interval_count } = customerEntitlement.entitlement;
	const anchor = customerEntitlement.next_reset_at;
	if (!anchor || !interval || interval === EntInterval.Lifetime) return null;

	const cycle = { anchor, interval, intervalCount: interval_count ?? 1, now };
	return {
		start: getCycleStart(cycle),
		end: getCycleEnd(cycle),
		createdAt: customerEntitlement.created_at,
	};
};

/** Current reset cycle of the shortest-cadence entitlement funding any of the
 * features, so mixed-interval subscriptions resolve to the charted feature's cycle. */
export const getFeatureCycleWindow = ({
	customerProducts,
	featureIds,
	now,
}: {
	customerProducts: FullCusProduct[];
	featureIds: string[];
	now: number;
}): FeatureCycleWindow | null => {
	const windows = customerProducts
		.flatMap((customerProduct) => customerProduct.customer_entitlements)
		.filter((customerEntitlement) =>
			fundsAnyFeature({ customerEntitlement, featureIds }),
		)
		.map((customerEntitlement) =>
			customerEntitlementToCycleWindow({ customerEntitlement, now }),
		)
		.filter((window): window is FeatureCycleWindow => window !== null);

	if (windows.length === 0) return null;

	return windows.reduce((shortest, window) =>
		window.end - window.start < shortest.end - shortest.start
			? window
			: shortest,
	);
};
