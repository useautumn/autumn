import {
	entToPooledBalanceIdentity,
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

/** Competing grants share one limited pool whatever their own unlimited flag; the pool decides it from its shares. */
export const initCustomerEntitlementPooledIdentity = ({
	customerEntitlement,
	lifecycle,
	competes = false,
}: {
	customerEntitlement: FullCustomerEntitlement;
	lifecycle: PooledBalanceIdentityLifecycle;
	competes?: boolean;
}): PooledBalanceIdentity => ({
	...entToPooledBalanceIdentity({
		entitlement: customerEntitlement.entitlement,
	}),
	...(competes ? { unlimited: false } : {}),
	resetCycleAnchor: lifecycle.resetCycleAnchor,
	resetMode: lifecycle.resetMode,
	stripeSubscriptionId: lifecycle.stripeSubscriptionId,
	customerLicenseLinkId: lifecycle.customerLicenseLinkId,
});
