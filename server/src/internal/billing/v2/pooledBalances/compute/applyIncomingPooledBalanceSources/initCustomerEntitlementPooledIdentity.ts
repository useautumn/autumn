import {
	EntInterval,
	type FullCustomerEntitlement,
	type PooledBalanceIdentity,
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
}): PooledBalanceIdentity => ({
	internalFeatureId: customerEntitlement.internal_feature_id,
	interval: customerEntitlement.entitlement.interval ?? EntInterval.Lifetime,
	intervalCount: customerEntitlement.entitlement.interval_count ?? 1,
	resetCycleAnchor: lifecycle.resetCycleAnchor,
	resetMode: lifecycle.resetMode,
	stripeSubscriptionId: lifecycle.stripeSubscriptionId,
	customerLicenseLinkId: lifecycle.customerLicenseLinkId,
	rolloverSignature: customerEntitlement.entitlement.rollover
		? JSON.stringify(customerEntitlement.entitlement.rollover)
		: "none",
});
