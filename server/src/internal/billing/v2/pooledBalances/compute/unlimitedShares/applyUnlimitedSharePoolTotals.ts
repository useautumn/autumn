import type { PooledBalancePlan } from "@autumn/shared";
import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";
import { addToUpdatePoolBalances } from "../utils/pooledBalancePlanUtils";
import {
	type PoolShare,
	setPoolUnlimited,
	sharesAfterPlan,
} from "../utils/poolShares";

const isUnlimitedShare = (contribution: PoolShare & { competes?: boolean }) =>
	(contribution.unlimited ?? false) && !(contribution.competes ?? false);

const poolIdsOf = (shares: Iterable<PoolShare>) =>
	new Set(Array.from(shares, (share) => share.pooled_balance_id));

/**
 * An additive pool is unlimited while any unlimited grant shares it; granted is
 * only ever the sum of its limited grants. When the last unlimited grant leaves,
 * the pool flips back to limited and the usage it ran up is forgiven: balance
 * returns to granted, as a reset would leave it.
 */
export const applyUnlimitedSharePoolTotals = ({
	computeContext,
	plan,
}: {
	computeContext: PooledBalanceComputeContext;
	plan: PooledBalancePlan;
}) => {
	const sharesBefore = computeContext.unlimitedShareContributionsBySourceId;
	const poolIdsBefore = poolIdsOf(sharesBefore.values());
	const poolIdsAfter = poolIdsOf(
		sharesAfterPlan({ sharesBefore, plan, isShare: isUnlimitedShare }),
	);

	for (const poolId of new Set([...poolIdsBefore, ...poolIdsAfter])) {
		const pooledCustomerEntitlement =
			computeContext.pooledCustomerEntitlementByPoolId.get(poolId);
		if (!pooledCustomerEntitlement) continue;

		const unlimited = poolIdsAfter.has(poolId);
		if (poolIdsBefore.has(poolId) && !unlimited) {
			const { granted } = pooledCustomerEntitlement.pooled_balance;
			addToUpdatePoolBalances({
				pooledBalancePlan: plan,
				pooledCustomerEntitlement,
				balance: granted,
				granted,
			});
		}
		if (Boolean(pooledCustomerEntitlement.unlimited) !== unlimited) {
			setPoolUnlimited({ plan, pooledCustomerEntitlement, unlimited });
		}
	}
};
