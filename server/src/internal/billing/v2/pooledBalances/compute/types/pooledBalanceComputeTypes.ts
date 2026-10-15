import type {
	DbPooledBalanceContribution,
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
	/** Pools a plan leaving this transition took a share from; excludes shares only converted to competing. */
	pooledBalanceIdsWithReplacedContributions: Set<string>;
	/** Competing shares as the customer held them before this transition, by source customer entitlement. */
	competingContributionsBySourceId: Map<string, DbPooledBalanceContribution>;
	/** Paid recurring customer products feeding each pool, kept current as plans leave and join; free sources prefer these pools. */
	paidCustomerProductIdsByPoolId: Map<string, Set<string>>;
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
