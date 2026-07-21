import type {
	FullCustomerEntitlement,
	PooledBalanceIdentity,
	PooledBalancePlan,
} from "@autumn/shared";

export type MutablePooledCustomerEntitlement = FullCustomerEntitlement & {
	pooled_balance: NonNullable<FullCustomerEntitlement["pooled_balance"]>;
};

export type PooledBalanceComputeContext = {
	plan: PooledBalancePlan;
	pooledCustomerEntitlements: MutablePooledCustomerEntitlement[];
	pooledCustomerEntitlementByPoolId: Map<
		string,
		MutablePooledCustomerEntitlement
	>;
	pooledCustomerEntitlementByIdentity: Map<
		string,
		MutablePooledCustomerEntitlement
	>;
	pooledBalanceIdsWithRemovedContributions: Set<string>;
};

export type PooledBalanceLifecycle = Pick<
	PooledBalanceIdentity,
	| "resetCycleAnchor"
	| "resetMode"
	| "stripeSubscriptionId"
	| "customerLicenseLinkId"
> & {
	nextResetAt: number | null;
};

export type PooledBalanceContributionAmounts = {
	currentContribution: number;
	nextCycleContribution: number;
};
