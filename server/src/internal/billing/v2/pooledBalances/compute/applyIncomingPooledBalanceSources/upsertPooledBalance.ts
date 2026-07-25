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
import { addToUpdatePoolBalances } from "../utils/pooledBalancePlanUtils";
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

	const balanceDelta =
		existingPooledCustomerEntitlement &&
		computeContext.pooledBalanceIdsWithRemovedContributions.has(
			existingPooledCustomerEntitlement.pooled_balance.id,
		)
			? contributionAmounts.currentContribution
			: (contributionCustomerEntitlement.balance ?? 0);

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

		return insertedPooledCustomerEntitlement;
	}

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

	return existingPooledCustomerEntitlement;
};
