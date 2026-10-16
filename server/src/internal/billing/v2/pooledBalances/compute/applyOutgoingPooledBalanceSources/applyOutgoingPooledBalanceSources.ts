import {
	type FullCusProduct,
	filterCustomerEntitlementsByPooledBalanceSource,
	InternalError,
	subtractSafe,
} from "@autumn/shared";
import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";
import {
	addToDeletePoolContributions,
	addToUpdatePoolBalances,
} from "../utils/pooledBalancePlanUtils";

export const applyOutgoingPooledBalanceSources = ({
	computeContext,
	customerProduct,
	convertingToCompeting = false,
}: {
	computeContext: PooledBalanceComputeContext;
	customerProduct?: FullCusProduct;
	/** The plan stays; its additive share only leaves to rejoin as a competing one. */
	convertingToCompeting?: boolean;
}) => {
	if (!customerProduct) return;

	const contributionCustomerEntitlements =
		filterCustomerEntitlementsByPooledBalanceSource({
			customerEntitlements: customerProduct.customer_entitlements,
		});

	for (const contributionCustomerEntitlement of contributionCustomerEntitlements) {
		const contribution =
			contributionCustomerEntitlement.pooled_balance_contribution;
		if (!contribution) continue;

		const pooledCustomerEntitlement =
			computeContext.pooledCustomerEntitlementByPoolId.get(
				contribution.pooled_balance_id,
			);
		if (!pooledCustomerEntitlement) {
			throw new InternalError({
				message: `Pooled balance '${contribution.pooled_balance_id}' was not hydrated for outgoing contribution '${contribution.id}'.`,
			});
		}

		const isLicenseKeyed =
			pooledCustomerEntitlement.pooled_balance.customer_license_link_id != null;
		// A competing share moves the pool in finalize, from the shares that remain.
		if (!contribution.competes)
			addToUpdatePoolBalances({
				pooledBalancePlan: computeContext.plan,
				pooledCustomerEntitlement,
				balance: isLicenseKeyed
					? (pooledCustomerEntitlement.balance ?? 0)
					: subtractSafe({
							left: pooledCustomerEntitlement.balance,
							right: contribution.current_contribution,
						}),
				granted: isLicenseKeyed
					? pooledCustomerEntitlement.pooled_balance.granted
					: subtractSafe({
							left: pooledCustomerEntitlement.pooled_balance.granted,
							right: contribution.current_contribution,
						}),
			});

		computeContext.pooledBalanceIdsWithRemovedContributions.add(
			contribution.pooled_balance_id,
		);
		computeContext.paidCustomerProductIdsByPoolId
			.get(contribution.pooled_balance_id)
			?.delete(customerProduct.id);
		computeContext.limitedSourceIdsByPoolId
			.get(contribution.pooled_balance_id)
			?.delete(contributionCustomerEntitlement.id);
		if (!convertingToCompeting)
			computeContext.pooledBalanceIdsWithReplacedContributions.add(
				contribution.pooled_balance_id,
			);

		addToDeletePoolContributions({
			pooledBalancePlan: computeContext.plan,
			contribution,
		});
	}
};
