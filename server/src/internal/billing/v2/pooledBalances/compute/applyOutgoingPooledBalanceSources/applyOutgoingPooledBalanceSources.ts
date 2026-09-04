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
}: {
	computeContext: PooledBalanceComputeContext;
	customerProduct?: FullCusProduct;
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

		addToDeletePoolContributions({
			pooledBalancePlan: computeContext.plan,
			contribution,
		});
	}
};
