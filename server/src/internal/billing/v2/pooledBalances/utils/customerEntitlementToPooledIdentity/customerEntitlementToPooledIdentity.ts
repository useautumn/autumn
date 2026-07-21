import {
	EntInterval,
	type FullCusEntWithFullCusProduct,
	isLifetimeEntitlement,
	type PooledBalanceIdentity,
} from "@autumn/shared";

/** The pool a source row feeds, derived entirely from the row. The reset
 * schedule mirrors the row; attach-time policies may override it. */
export const customerEntitlementToPooledIdentity = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
}): PooledBalanceIdentity => {
	const { entitlement } = customerEntitlement;
	const isLifetime = isLifetimeEntitlement({ entitlement });

	return {
		featureId: entitlement.feature.id,
		internalFeatureId: entitlement.internal_feature_id,
		interval: entitlement.interval ?? EntInterval.Lifetime,
		intervalCount: entitlement.interval_count ?? 1,
		resetCycleAnchor: isLifetime
			? null
			: (customerEntitlement.reset_cycle_anchor ?? null),
		nextResetAt: isLifetime
			? null
			: (customerEntitlement.next_reset_at ?? null),
		rollover: entitlement.rollover ?? null,
	};
};
