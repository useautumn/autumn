import {
	customerProductHasActiveStatus,
	entToPooledBalanceIdentity,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	isBooleanEntitlement,
	isCustomerProductFree,
	isCustomerProductPaidRecurring,
	isPooledBalanceSourceCustomerEntitlement,
	isUnlimitedEntitlement,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { customerEntitlementCompetes } from "../competing/customerEntitlementCompetes";
import type {
	MutablePooledCustomerEntitlement,
	PooledBalanceComputeContext,
} from "../types/pooledBalanceComputeTypes";

/** An active, paid, recurring plan: its subscription pool is the one free plans should share. */
export const isPaidSubscriptionPoolHost = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}) =>
	customerProductHasActiveStatus(customerProduct) &&
	!customerProduct.customer_license_link_id &&
	isCustomerProductPaidRecurring(customerProduct);

export const addPaidCustomerProductToPool = ({
	paidCustomerProductIdsByPoolId,
	poolId,
	customerProductId,
}: {
	paidCustomerProductIdsByPoolId: Map<string, Set<string>>;
	poolId: string;
	customerProductId: string;
}) => {
	const customerProductIds =
		paidCustomerProductIdsByPoolId.get(poolId) ?? new Set<string>();
	customerProductIds.add(customerProductId);
	paidCustomerProductIdsByPoolId.set(poolId, customerProductIds);
};

const poolHasPaidHost = ({
	computeContext,
	poolId,
}: {
	computeContext: PooledBalanceComputeContext;
	poolId: string;
}) =>
	(computeContext.paidCustomerProductIdsByPoolId.get(poolId)?.size ?? 0) > 0;

/**
 * A free source joins the customer's subscription pool for the same feature and
 * cycle instead of opening a lazy pool of its own, so one balance covers both.
 * It inherits that pool's anchor and reset cadence, and stays in it after the
 * subscription ends. A pool a paid plan still feeds wins, then the oldest.
 */
export const findSubscriptionPoolHost = ({
	computeContext,
	customerEntitlement,
}: {
	computeContext: PooledBalanceComputeContext;
	customerEntitlement: FullCustomerEntitlement;
}): MutablePooledCustomerEntitlement | undefined => {
	const { entitlement } = customerEntitlement;
	const tracksBalance =
		!isUnlimitedEntitlement({ entitlement }) &&
		!isBooleanEntitlement({ entitlement });
	if (!tracksBalance) return undefined;

	const sourceIdentity = entToPooledBalanceIdentity({ entitlement });

	const candidates = computeContext.pooledCustomerEntitlements.filter(
		({ pooled_balance }) =>
			pooled_balance.reset_mode === PooledBalanceResetMode.Subscription &&
			pooled_balance.stripe_subscription_id != null &&
			pooled_balance.customer_license_link_id == null &&
			pooled_balance.expires_at == null &&
			pooled_balance.internal_feature_id === sourceIdentity.internalFeatureId &&
			!(pooled_balance.unlimited ?? false) &&
			pooled_balance.interval === sourceIdentity.interval &&
			pooled_balance.interval_count === sourceIdentity.intervalCount &&
			pooled_balance.rollover_signature === sourceIdentity.rolloverSignature &&
			pooled_balance.feature_override_signature ===
				sourceIdentity.featureOverrideSignature,
	);

	const hostRank = (pool: MutablePooledCustomerEntitlement) =>
		poolHasPaidHost({ computeContext, poolId: pool.pooled_balance.id }) ? 0 : 1;

	return candidates.sort(
		(a, b) =>
			hostRank(a) - hostRank(b) ||
			a.pooled_balance.created_at - b.pooled_balance.created_at ||
			a.pooled_balance.id.localeCompare(b.pooled_balance.id),
	)[0];
};

/**
 * Free plans the customer already holds whose credits sit outside a subscription
 * pool a paid plan feeds — a lazy pool, or one left by an ended subscription —
 * while such a pool now exists. They move into it; usage in the old pool is forgiven.
 */
export const misplacedFreeCustomerProducts = ({
	computeContext,
	fullCustomer,
	excludedCustomerProductIds,
}: {
	computeContext: PooledBalanceComputeContext;
	fullCustomer: FullCustomer;
	excludedCustomerProductIds: Set<string>;
}): FullCusProduct[] =>
	fullCustomer.customer_products.flatMap((customerProduct) => {
		if (excludedCustomerProductIds.has(customerProduct.id)) return [];
		if (!customerProductHasActiveStatus(customerProduct)) return [];
		if (customerProduct.customer_license_link_id) return [];
		if (!isCustomerProductFree(customerProduct)) return [];

		const misplaced = (customerProduct.customer_entitlements ?? []).filter(
			(customerEntitlement) => {
				const contribution = customerEntitlement.pooled_balance_contribution;
				if (!contribution || contribution.competes) return false;
				if (!isPooledBalanceSourceCustomerEntitlement({ customerEntitlement }))
					return false;
				// Grants that should compete are the stale-competing repair's to move, not this one's.
				if (
					customerEntitlementCompetes({ customerEntitlement, customerProduct })
				)
					return false;

				const currentPool =
					computeContext.pooledCustomerEntitlementByPoolId.get(
						contribution.pooled_balance_id,
					)?.pooled_balance;
				const inHostedSubscriptionPool =
					currentPool?.reset_mode === PooledBalanceResetMode.Subscription &&
					poolHasPaidHost({ computeContext, poolId: currentPool.id });
				if (inHostedSubscriptionPool) return false;

				const host = findSubscriptionPoolHost({
					computeContext,
					customerEntitlement,
				});
				return (
					host !== undefined &&
					host.pooled_balance.id !== contribution.pooled_balance_id &&
					poolHasPaidHost({ computeContext, poolId: host.pooled_balance.id })
				);
			},
		);
		return misplaced.length > 0
			? [{ ...customerProduct, customer_entitlements: misplaced }]
			: [];
	});
