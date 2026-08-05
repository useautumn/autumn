import {
	addSafe,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isBooleanEntitlement,
	type PooledBalanceIdentity,
	pooledBalanceIdentityToKey,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addInsertedPooledBalanceToComputeContext } from "../context/pooledBalanceComputeContextUtils";
import type {
	MutablePooledCustomerEntitlement,
	PooledBalanceComputeContext,
	PooledBalanceContributionAmounts,
} from "../types/pooledBalanceComputeTypes";
import {
	addToUpdatePoolBalances,
	carrySourceRolloversToPool,
} from "../utils/pooledBalancePlanUtils";
import { initPooledBalanceGraph } from "./initPooledBalanceGraph";

export const upsertPooledBalance = ({
	ctx,
	computeContext,
	contributionCustomerEntitlement,
	customerProduct,
	identity,
	contributionAmounts,
	nextResetAt,
	now,
}: {
	ctx: AutumnContext;
	computeContext: PooledBalanceComputeContext;
	contributionCustomerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	identity: PooledBalanceIdentity;
	contributionAmounts: PooledBalanceContributionAmounts;
	nextResetAt: number | null;
	now: number;
}): MutablePooledCustomerEntitlement => {
	const existingPooledCustomerEntitlement =
		computeContext.pooledCustomerEntitlementByIdentity.get(
			pooledBalanceIdentityToKey({ identity }),
		);
	const tracksBalance =
		!identity.unlimited &&
		!isBooleanEntitlement({
			entitlement: contributionCustomerEntitlement.entitlement,
		});

	// A source that was already pooled carries balance 0 — its grant lives in the
	// pool it is leaving. Seed from the contribution instead, whether the grant
	// lands back on the same pool or on a newly inserted one.
	const replacesRemovedContribution = Array.from(
		computeContext.pooledBalanceIdsWithRemovedContributions,
	).some(
		(poolId) =>
			computeContext.pooledCustomerEntitlementByPoolId.get(poolId)
				?.pooled_balance.internal_feature_id === identity.internalFeatureId,
	);

	let balanceDelta = tracksBalance
		? (contributionCustomerEntitlement.balance ?? 0)
		: 0;
	if (tracksBalance && replacesRemovedContribution) {
		balanceDelta = contributionAmounts.currentContribution;
	}

	// Re-admitting a source that still contributes to this very pool would count
	// its grant twice: the pool already includes it, and nothing removed it. Only
	// the difference is owed, so re-running a transition is a no-op.
	const existingContribution =
		contributionCustomerEntitlement.pooled_balance_contribution;
	const alreadyCountedByPool =
		existingContribution &&
		existingPooledCustomerEntitlement &&
		existingContribution.pooled_balance_id ===
			existingPooledCustomerEntitlement.pooled_balance.id &&
		!computeContext.pooledBalanceIdsWithRemovedContributions.has(
			existingContribution.pooled_balance_id,
		);
	const grantedDelta = alreadyCountedByPool
		? contributionAmounts.currentContribution -
			(existingContribution.current_contribution ?? 0)
		: contributionAmounts.currentContribution;
	if (alreadyCountedByPool) {
		balanceDelta = 0;
	}

	if (!existingPooledCustomerEntitlement) {
		const insertedPooledCustomerEntitlement = initPooledBalanceGraph({
			ctx,
			contributionCustomerEntitlement,
			customerProduct,
			identity,
			balanceDelta,
			granted: contributionAmounts.currentContribution,
			nextResetAt,
			now,
		});

		addInsertedPooledBalanceToComputeContext({
			computeContext,
			pooledCustomerEntitlement: insertedPooledCustomerEntitlement,
		});
		if (tracksBalance) {
			carrySourceRolloversToPool({
				pooledBalancePlan: computeContext.plan,
				contributionCustomerEntitlement,
				pooledCustomerEntitlement: insertedPooledCustomerEntitlement,
			});
		}

		return insertedPooledCustomerEntitlement;
	}

	const shouldUpdateExistingPooledBalance =
		balanceDelta !== 0 || grantedDelta !== 0;
	if (shouldUpdateExistingPooledBalance) {
		addToUpdatePoolBalances({
			pooledBalancePlan: computeContext.plan,
			pooledCustomerEntitlement: existingPooledCustomerEntitlement,
			balance: addSafe({
				left: existingPooledCustomerEntitlement.balance,
				right: balanceDelta,
			}),
			granted: addSafe({
				left: existingPooledCustomerEntitlement.pooled_balance.granted,
				right: grantedDelta,
			}),
		});
	}
	if (tracksBalance) {
		carrySourceRolloversToPool({
			pooledBalancePlan: computeContext.plan,
			contributionCustomerEntitlement,
			pooledCustomerEntitlement: existingPooledCustomerEntitlement,
		});
	}

	return existingPooledCustomerEntitlement;
};
