import { featureToCombine, type PooledBalancePlan } from "@autumn/shared";
import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";
import { addToUpdatePoolBalances } from "../utils/pooledBalancePlanUtils";
import {
	type PoolShare,
	setPoolUnlimited,
	sharesAfterPlan,
} from "../utils/poolShares";
import { type CompetingShare, competingPoolState } from "./competingPoolState";

const sharesByPool = ({ shares }: { shares: Iterable<PoolShare> }) => {
	const byPool = new Map<string, CompetingShare[]>();
	for (const share of shares) {
		const poolShares = byPool.get(share.pooled_balance_id) ?? [];
		poolShares.push({
			poolId: share.pooled_balance_id,
			amount: share.current_contribution ?? 0,
			unlimited: share.unlimited ?? false,
		});
		byPool.set(share.pooled_balance_id, poolShares);
	}
	return byPool;
};

/** A max / min pool's competing part is its best share, not their sum: granted and balance move by the change in the best. */
export const applyCompetingPoolTotals = ({
	computeContext,
	plan,
}: {
	computeContext: PooledBalanceComputeContext;
	plan: PooledBalancePlan;
}) => {
	const before = sharesByPool({
		shares: computeContext.competingContributionsBySourceId.values(),
	});
	const after = sharesByPool({
		shares: sharesAfterPlan({
			sharesBefore: computeContext.competingContributionsBySourceId,
			plan,
			isShare: (contribution) => contribution.competes ?? false,
		}),
	});

	for (const poolId of new Set([...before.keys(), ...after.keys()])) {
		const pooledCustomerEntitlement =
			computeContext.pooledCustomerEntitlementByPoolId.get(poolId);
		if (!pooledCustomerEntitlement) continue;

		const combine = featureToCombine({
			feature: pooledCustomerEntitlement.entitlement.feature,
		});
		const stateBefore = competingPoolState({
			shares: before.get(poolId) ?? [],
			combine,
		});
		const stateAfter = competingPoolState({
			shares: after.get(poolId) ?? [],
			combine,
		});

		const delta = stateAfter.best - stateBefore.best;
		if (delta !== 0) {
			addToUpdatePoolBalances({
				pooledBalancePlan: plan,
				pooledCustomerEntitlement,
				balance: (pooledCustomerEntitlement.balance ?? 0) + delta,
				granted: pooledCustomerEntitlement.pooled_balance.granted + delta,
			});
		}
		if (Boolean(pooledCustomerEntitlement.unlimited) !== stateAfter.unlimited) {
			setPoolUnlimited({
				plan,
				pooledCustomerEntitlement,
				unlimited: stateAfter.unlimited,
			});
		}
	}
};
