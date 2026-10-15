import {
	type DbPooledBalanceContribution,
	featureToCombine,
	type InsertPooledBalanceContribution,
	type PooledBalancePlan,
} from "@autumn/shared";
import type {
	MutablePooledCustomerEntitlement,
	PooledBalanceComputeContext,
} from "../types/pooledBalanceComputeTypes";
import { addToUpdatePoolBalances } from "../utils/pooledBalancePlanUtils";
import { type CompetingShare, competingPoolState } from "./competingPoolState";

type Share = Pick<
	InsertPooledBalanceContribution,
	"pooled_balance_id" | "current_contribution" | "unlimited"
>;

const sharesByPool = ({ shares }: { shares: Iterable<Share> }) => {
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

/** The competing shares once the plan lands: removed ones gone, written ones at their new value. */
const competingSharesAfterPlan = ({
	computeContext,
	plan,
}: {
	computeContext: PooledBalanceComputeContext;
	plan: PooledBalancePlan;
}) => {
	const bySource = new Map<string, Share>(
		computeContext.competingContributionsBySourceId,
	);
	for (const contribution of plan.deletePoolContributions) {
		bySource.delete(contribution.source_customer_entitlement_id);
	}
	const written: Array<
		InsertPooledBalanceContribution | DbPooledBalanceContribution
	> = [...plan.insertPoolContributions, ...plan.updatePoolContributions];
	for (const contribution of written) {
		if (contribution.competes) {
			bySource.set(contribution.source_customer_entitlement_id, contribution);
		} else {
			bySource.delete(contribution.source_customer_entitlement_id);
		}
	}
	return bySource.values();
};

const setPoolUnlimited = ({
	plan,
	pooledCustomerEntitlement,
	unlimited,
}: {
	plan: PooledBalancePlan;
	pooledCustomerEntitlement: MutablePooledCustomerEntitlement;
	unlimited: boolean;
}) => {
	pooledCustomerEntitlement.unlimited = unlimited;
	const isInserted = plan.insertPoolBalances.some(
		({ id }) => id === pooledCustomerEntitlement.id,
	);
	if (isInserted) return;

	const update = plan.updatePoolBalances.find(
		(candidate) =>
			candidate.pooledCustomerEntitlement.id === pooledCustomerEntitlement.id,
	);
	if (update) {
		update.unlimited = unlimited;
		return;
	}
	plan.updatePoolBalances.push({
		pooledCustomerEntitlement,
		balanceDelta: 0,
		grantedDelta: 0,
		unlimited,
	});
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
		shares: competingSharesAfterPlan({ computeContext, plan }),
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
