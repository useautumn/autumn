import {
	type FullCusProduct,
	type FullCustomerEntitlement,
	InternalError,
	pooledBalanceIdentityToKey,
	pooledBalanceToPooledBalanceIdentity,
} from "@autumn/shared";
import { emptyPooledBalancePlan } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";
import type {
	MutablePooledCustomerEntitlement,
	PooledBalanceComputeContext,
} from "../types/pooledBalanceComputeTypes";
import {
	addPaidCustomerProductToPool,
	isPaidSubscriptionPoolHost,
} from "../utils/subscriptionPoolHost";

const clonePooledCustomerEntitlements = ({
	customerEntitlements,
}: {
	customerEntitlements: FullCustomerEntitlement[];
}): MutablePooledCustomerEntitlement[] =>
	customerEntitlements.map((customerEntitlement) => {
		const clonedCustomerEntitlement = structuredClone(customerEntitlement);
		if (!clonedCustomerEntitlement.pooled_balance) {
			throw new InternalError({
				message: `Synthetic pooled customer entitlement '${clonedCustomerEntitlement.id}' is missing its pooled balance.`,
			});
		}

		return clonedCustomerEntitlement as MutablePooledCustomerEntitlement;
	});

const competingContributionsOf = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}) =>
	new Map(
		customerProducts.flatMap((customerProduct) =>
			(customerProduct.customer_entitlements ?? []).flatMap(
				(customerEntitlement) => {
					const contribution = customerEntitlement.pooled_balance_contribution;
					return contribution?.competes
						? [[customerEntitlement.id, contribution] as const]
						: [];
				},
			),
		),
	);

const paidCustomerProductIdsByPoolIdOf = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}) => {
	const paidCustomerProductIdsByPoolId = new Map<string, Set<string>>();
	for (const customerProduct of customerProducts) {
		if (
			!isPaidSubscriptionPoolHost({
				customerProduct,
			})
		) {
			continue;
		}
		for (const customerEntitlement of customerProduct.customer_entitlements ??
			[]) {
			const poolId =
				customerEntitlement.pooled_balance_contribution?.pooled_balance_id;
			if (!poolId) continue;
			addPaidCustomerProductToPool({
				paidCustomerProductIdsByPoolId,
				poolId,
				customerProductId: customerProduct.id,
			});
		}
	}
	return paidCustomerProductIdsByPoolId;
};

export const setupPooledBalanceComputeContext = ({
	pooledCustomerEntitlements: inputPooledCustomerEntitlements,
	customerProducts = [],
}: {
	pooledCustomerEntitlements: FullCustomerEntitlement[];
	customerProducts?: FullCusProduct[];
}): PooledBalanceComputeContext => {
	const pooledCustomerEntitlements = clonePooledCustomerEntitlements({
		customerEntitlements: inputPooledCustomerEntitlements,
	});

	return {
		plan: emptyPooledBalancePlan(),
		pooledCustomerEntitlements,
		pooledCustomerEntitlementByPoolId: new Map(
			pooledCustomerEntitlements.map((customerEntitlement) => [
				customerEntitlement.pooled_balance.id,
				customerEntitlement,
			]),
		),
		pooledCustomerEntitlementByIdentity: new Map(
			pooledCustomerEntitlements.map((customerEntitlement) => [
				pooledBalanceIdentityToKey({
					identity: pooledBalanceToPooledBalanceIdentity({
						pooledBalance: customerEntitlement.pooled_balance,
					}),
				}),
				customerEntitlement,
			]),
		),
		pooledBalanceIdsWithRemovedContributions: new Set(),
		pooledBalanceIdsWithReplacedContributions: new Set(),
		competingContributionsBySourceId: competingContributionsOf({
			customerProducts,
		}),
		paidCustomerProductIdsByPoolId: paidCustomerProductIdsByPoolIdOf({
			customerProducts,
		}),
	};
};
