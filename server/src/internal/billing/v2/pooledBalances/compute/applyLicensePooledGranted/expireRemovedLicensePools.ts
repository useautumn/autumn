import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";
import { addToExpirePoolBalanceCandidates } from "../utils/pooledBalancePlanUtils";

export const expireRemovedLicensePools = ({
	computeContext,
	customerLicenseLinkIds,
	retainedPoolIds,
	now,
}: {
	computeContext: PooledBalanceComputeContext;
	customerLicenseLinkIds: Set<string>;
	retainedPoolIds: Set<string>;
	now: number;
}) => {
	for (const pooledCustomerEntitlement of computeContext.pooledCustomerEntitlements) {
		const { id, customer_license_link_id } =
			pooledCustomerEntitlement.pooled_balance;
		if (!customer_license_link_id) continue;
		if (!customerLicenseLinkIds.has(customer_license_link_id)) continue;
		if (retainedPoolIds.has(id)) continue;

		addToExpirePoolBalanceCandidates({
			pooledBalancePlan: computeContext.plan,
			pooledCustomerEntitlement,
			expiresAt: now,
		});
	}
};
