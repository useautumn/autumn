import {
	type FullCustomerEntitlement,
	InternalError,
	pooledBalanceIdentityToKey,
	pooledBalanceToPooledBalanceIdentity,
} from "@autumn/shared";
import { emptyPooledBalancePlan } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";
import type {
	MutablePooledCustomerEntitlement,
	PooledBalanceComputeContext,
} from "../types/pooledBalanceComputeTypes";

const clonePooledCustomerEntitlements = ({
	customerEntitlements,
}: {
	customerEntitlements: FullCustomerEntitlement[];
}): MutablePooledCustomerEntitlement[] =>
	customerEntitlements.map((customerEntitlement) => {
		const clonedCustomerEntitlement = structuredClone(customerEntitlement);
		if (!clonedCustomerEntitlement.pooled_balance) {
			throw new InternalError({
				message: `Synthetic pooled customer entitlement '${clonedCustomerEntitlement.id}' is missing its pooled balance.`,
			});
		}

		return clonedCustomerEntitlement as MutablePooledCustomerEntitlement;
	});

export const setupPooledBalanceComputeContext = ({
	pooledCustomerEntitlements: inputPooledCustomerEntitlements,
}: {
	pooledCustomerEntitlements: FullCustomerEntitlement[];
}): PooledBalanceComputeContext => {
	const pooledCustomerEntitlements = clonePooledCustomerEntitlements({
		customerEntitlements: inputPooledCustomerEntitlements,
	});

	return {
		plan: emptyPooledBalancePlan(),
		pooledCustomerEntitlements,
		pooledCustomerEntitlementByPoolId: new Map(
			pooledCustomerEntitlements.map((customerEntitlement) => [
				customerEntitlement.pooled_balance.id,
				customerEntitlement,
			]),
		),
		pooledCustomerEntitlementByIdentity: new Map(
			pooledCustomerEntitlements.map((customerEntitlement) => [
				pooledBalanceIdentityToKey({
					identity: pooledBalanceToPooledBalanceIdentity({
						pooledBalance: customerEntitlement.pooled_balance,
					}),
				}),
				customerEntitlement,
			]),
		),
		pooledBalanceIdsWithRemovedContributions: new Set(),
	};
};
