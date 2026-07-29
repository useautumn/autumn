import {
	addSafe,
	type FullCusProduct,
	type FullCustomerEntitlement,
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

	let balanceDelta = contributionCustomerEntitlement.balance ?? 0;
	if (identity.unlimited) {
		balanceDelta = 0;
	} else if (
		existingPooledCustomerEntitlement &&
		computeContext.pooledBalanceIdsWithRemovedContributions.has(
			existingPooledCustomerEntitlement.pooled_balance.id,
		)
	) {
		balanceDelta = contributionAmounts.currentContribution;
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
		if (!identity.unlimited) {
			carrySourceRolloversToPool({
				pooledBalancePlan: computeContext.plan,
				contributionCustomerEntitlement,
				pooledCustomerEntitlement: insertedPooledCustomerEntitlement,
			});
		}

		return insertedPooledCustomerEntitlement;
	}

	const shouldUpdateExistingPooledBalance =
		balanceDelta !== 0 || contributionAmounts.currentContribution !== 0;
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
				right: contributionAmounts.currentContribution,
			}),
		});
	}
	if (!identity.unlimited) {
		carrySourceRolloversToPool({
			pooledBalancePlan: computeContext.plan,
			contributionCustomerEntitlement,
			pooledCustomerEntitlement: existingPooledCustomerEntitlement,
		});
	}

	return existingPooledCustomerEntitlement;
};
