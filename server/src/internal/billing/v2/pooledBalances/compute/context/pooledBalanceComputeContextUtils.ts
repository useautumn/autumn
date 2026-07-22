import {
	pooledBalanceIdentityToKey,
	pooledBalanceToPooledBalanceIdentity,
} from "@autumn/shared";
import type {
	MutablePooledCustomerEntitlement,
	PooledBalanceComputeContext,
} from "../types/pooledBalanceComputeTypes";

export const addInsertedPooledBalanceToComputeContext = ({
	computeContext,
	pooledCustomerEntitlement,
}: {
	computeContext: PooledBalanceComputeContext;
	pooledCustomerEntitlement: MutablePooledCustomerEntitlement;
}) => {
	const pooledBalance = pooledCustomerEntitlement.pooled_balance;
	computeContext.pooledCustomerEntitlements.push(pooledCustomerEntitlement);
	computeContext.pooledCustomerEntitlementByPoolId.set(
		pooledBalance.id,
		pooledCustomerEntitlement,
	);
	computeContext.pooledCustomerEntitlementByIdentity.set(
		pooledBalanceIdentityToKey({
			identity: pooledBalanceToPooledBalanceIdentity({ pooledBalance }),
		}),
		pooledCustomerEntitlement,
	);
	computeContext.plan.insertPoolBalances.push(pooledCustomerEntitlement);
};
