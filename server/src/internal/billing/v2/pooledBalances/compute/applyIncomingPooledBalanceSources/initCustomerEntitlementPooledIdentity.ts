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

export const initCustomerEntitlementPooledIdentity = ({
	customerEntitlement,
	lifecycle,
}: {
	customerEntitlement: FullCustomerEntitlement;
	lifecycle: PooledBalanceIdentityLifecycle;
}): PooledBalanceIdentity => ({
	...entToPooledBalanceIdentity({
		entitlement: customerEntitlement.entitlement,
	}),
	resetCycleAnchor: lifecycle.resetCycleAnchor,
	resetMode: lifecycle.resetMode,
	stripeSubscriptionId: lifecycle.stripeSubscriptionId,
	customerLicenseLinkId: lifecycle.customerLicenseLinkId,
});
