import {
	customerProductHasActiveStatus,
	entToPooledBalanceIdentity,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	isBooleanEntitlement,
	isCompetingCombineFeature,
	isCustomerProductPaidRecurring,
	isPooledBalanceSourceCustomerEntitlement,
	isUnlimitedEntitlement,
	PooledBalanceResetMode,
} from "@autumn/shared";
import type {
	MutablePooledCustomerEntitlement,
	PooledBalanceComputeContext,
} from "../types/pooledBalanceComputeTypes";
import { poolHasPaidHost } from "./subscriptionPoolHost";

/** An unlimited grant on an additive feature: it rides a limited pool as a zero-amount share instead of opening its own. */
export const isUnlimitedAdditiveSource = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
}) => {
	const { entitlement } = customerEntitlement;
	return (
		isUnlimitedEntitlement({ entitlement }) &&
		!isBooleanEntitlement({ entitlement }) &&
		!isCompetingCombineFeature({ feature: entitlement.feature }) &&
		!customerProduct.customer_license_link_id
	);
};

/** A grant that counts toward a pool's granted total; an unlimited share or a competing one does not. */
export const isLimitedAdditiveSource = ({
	customerEntitlement,
	competes,
}: {
	customerEntitlement: FullCustomerEntitlement;
	competes: boolean;
}) => {
	const { entitlement } = customerEntitlement;
	return (
		!competes &&
		!isUnlimitedEntitlement({ entitlement }) &&
		!isBooleanEntitlement({ entitlement })
	);
};

export const addLimitedSourceToPool = ({
	computeContext,
	poolId,
	customerEntitlementId,
}: {
	computeContext: PooledBalanceComputeContext;
	poolId: string;
	customerEntitlementId: string;
}) => {
	const sourceIds =
		computeContext.limitedSourceIdsByPoolId.get(poolId) ?? new Set<string>();
	sourceIds.add(customerEntitlementId);
	computeContext.limitedSourceIdsByPoolId.set(poolId, sourceIds);
};

const poolHasLimitedSource = ({
	computeContext,
	poolId,
}: {
	computeContext: PooledBalanceComputeContext;
	poolId: string;
}) => (computeContext.limitedSourceIdsByPoolId.get(poolId)?.size ?? 0) > 0;

/**
 * The limited pool an unlimited additive grant joins. Interval, interval count,
 * anchor and rollover are ignored: the grant has nothing to reset or roll over,
 * so it takes the pool's cycle and rollover. A paid grant stays on its own
 * subscription; a free one joins any limited pool. A pool a paid plan feeds
 * wins, then the oldest.
 */
export const findUnlimitedShareHost = ({
	computeContext,
	customerEntitlement,
	customerProduct,
	stripeSubscriptionId,
}: {
	computeContext: PooledBalanceComputeContext;
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	stripeSubscriptionId?: string;
}): MutablePooledCustomerEntitlement | undefined => {
	if (!isUnlimitedAdditiveSource({ customerEntitlement, customerProduct })) {
		return undefined;
	}

	const sourceIdentity = entToPooledBalanceIdentity({
		entitlement: customerEntitlement.entitlement,
	});
	const paidSubscriptionId = isCustomerProductPaidRecurring(customerProduct)
		? (stripeSubscriptionId ??
			customerProduct.subscription_ids?.[0] ??
			customerProduct.id)
		: undefined;

	const candidates = computeContext.pooledCustomerEntitlements.filter(
		({ pooled_balance }) =>
			pooled_balance.customer_license_link_id == null &&
			pooled_balance.expires_at == null &&
			!(pooled_balance.unlimited ?? false) &&
			pooled_balance.internal_feature_id === sourceIdentity.internalFeatureId &&
			pooled_balance.feature_override_signature ===
				sourceIdentity.featureOverrideSignature &&
			(paidSubscriptionId === undefined ||
				(pooled_balance.reset_mode === PooledBalanceResetMode.Subscription &&
					pooled_balance.stripe_subscription_id === paidSubscriptionId)) &&
			poolHasLimitedSource({ computeContext, poolId: pooled_balance.id }),
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
 * Plans the customer already holds whose unlimited grants sit in a pool with no
 * limited grant — their own unlimited pool, or one every limited grant has left —
 * while a limited pool they could join now exists. They move into it; usage in
 * the old pool is forgiven.
 */
export const misplacedUnlimitedCustomerProducts = ({
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

		const misplaced = (customerProduct.customer_entitlements ?? []).filter(
			(customerEntitlement) => {
				const contribution = customerEntitlement.pooled_balance_contribution;
				if (!contribution || contribution.competes) return false;
				if (!isPooledBalanceSourceCustomerEntitlement({ customerEntitlement }))
					return false;
				if (
					poolHasLimitedSource({
						computeContext,
						poolId: contribution.pooled_balance_id,
					})
				)
					return false;

				const host = findUnlimitedShareHost({
					computeContext,
					customerEntitlement,
					customerProduct,
				});
				return (
					host !== undefined &&
					host.pooled_balance.id !== contribution.pooled_balance_id
				);
			},
		);
		return misplaced.length > 0
			? [{ ...customerProduct, customer_entitlements: misplaced }]
			: [];
	});
