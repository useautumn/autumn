import {
	addSafe,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
	type PooledBalanceIdentity,
	pooledBalanceIdentityToKey,
	subtractSafe,
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
	competes,
	now,
}: {
	ctx: AutumnContext;
	computeContext: PooledBalanceComputeContext;
	contributionCustomerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	identity: PooledBalanceIdentity;
	contributionAmounts: PooledBalanceContributionAmounts;
	nextResetAt: number | null;
	/** A competing share moves the pool once every share is known, in finalize. */
	competes: boolean;
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
		computeContext.pooledBalanceIdsWithReplacedContributions,
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
	const isLicenseKeyed = identity.customerLicenseLinkId != null;
	const grantedDelta =
		isLicenseKeyed || competes
			? 0
			: alreadyCountedByPool
				? contributionAmounts.currentContribution -
					(existingContribution.current_contribution ?? 0)
				: contributionAmounts.currentContribution;
	if (alreadyCountedByPool || isLicenseKeyed) {
		balanceDelta = 0;
	}
	// A competing grant's amount enters in finalize; only usage it already holds moves the pool now.
	if (competes) {
		const holdsOwnUsage =
			tracksBalance &&
			!isUnlimitedEntitlement({
				entitlement: contributionCustomerEntitlement.entitlement,
			}) &&
			!existingContribution &&
			!contributionCustomerEntitlement.pooled_contribution_id &&
			!replacesRemovedContribution;
		balanceDelta = holdsOwnUsage
			? subtractSafe({
					left: contributionCustomerEntitlement.balance ?? 0,
					right: contributionAmounts.currentContribution,
				})
			: 0;
	}

	if (!existingPooledCustomerEntitlement) {
		const insertedPooledCustomerEntitlement = initPooledBalanceGraph({
			ctx,
			contributionCustomerEntitlement,
			customerProduct,
			identity,
			balanceDelta,
			granted:
				isLicenseKeyed || competes
					? 0
					: contributionAmounts.currentContribution,
			nextResetAt,
			now,
		});
		if (competes) insertedPooledCustomerEntitlement.unlimited = false;

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
