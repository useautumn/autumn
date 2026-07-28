import {
	EntInterval,
	type FullCustomerEntitlement,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
	type PooledBalanceIdentity,
	rolloverConfigToSignature,
} from "@autumn/shared";
import type { PooledBalanceLifecycle } from "../types/pooledBalanceComputeTypes";

type PooledBalanceIdentityLifecycle = Pick<
	PooledBalanceLifecycle,
	| "resetCycleAnchor"
	| "resetMode"
	| "stripeSubscriptionId"
	| "customerLicenseLinkId"
>;

export const initCustomerEntitlementPooledIdentity = ({
	customerEntitlement,
	lifecycle,
}: {
	customerEntitlement: FullCustomerEntitlement;
	lifecycle: PooledBalanceIdentityLifecycle;
}): PooledBalanceIdentity => {
	const unlimited = isUnlimitedEntitlement({
		entitlement: customerEntitlement.entitlement,
	});
	const tracksBalance =
		!unlimited &&
		!isBooleanEntitlement({
			entitlement: customerEntitlement.entitlement,
		});

	return {
		internalFeatureId: customerEntitlement.internal_feature_id,
		unlimited,
		interval: customerEntitlement.entitlement.interval ?? EntInterval.Lifetime,
		intervalCount: customerEntitlement.entitlement.interval_count ?? 1,
		resetCycleAnchor: lifecycle.resetCycleAnchor,
		resetMode: lifecycle.resetMode,
		stripeSubscriptionId: lifecycle.stripeSubscriptionId,
		customerLicenseLinkId: lifecycle.customerLicenseLinkId,
		rolloverSignature: tracksBalance
			? rolloverConfigToSignature({
					rollover: customerEntitlement.entitlement.rollover,
				})
			: "none",
	};
};
