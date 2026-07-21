import {
	BillingType,
	customerPriceToCustomerEntitlement,
	EntInterval,
	type FeatureOptions,
	type FullCusProduct,
	getBillingType,
	getStartingBalance,
	InternalError,
	type PooledBalanceOp,
} from "@autumn/shared";
import { isPooledSourceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";

export const computePooledQuantityUpdateOps = ({
	customerProduct,
	updatedOptions,
}: {
	customerProduct: FullCusProduct;
	updatedOptions: FeatureOptions[];
}): PooledBalanceOp[] => {
	const operations: PooledBalanceOp[] = [];

	for (const updatedOption of updatedOptions) {
		const customerPrice = customerProduct.customer_prices.find(
			(candidate) =>
				candidate.price.config.internal_feature_id ===
					updatedOption.internal_feature_id &&
				getBillingType(candidate.price.config) === BillingType.UsageInAdvance,
		);
		if (!customerPrice) continue;

		const customerEntitlement = customerPriceToCustomerEntitlement({
			customerPrice,
			customerEntitlements: customerProduct.customer_entitlements,
			errorOnNotFound: true,
		});
		const { entitlement } = customerEntitlement;
		if (
			!isPooledSourceCustomerEntitlement({
				customerEntitlement,
				customerProduct,
			})
		)
			continue;

		const subscriptionId = customerProduct.subscription_ids?.[0];
		if (!subscriptionId) {
			throw new InternalError({
				message: `Pooled prepaid source '${customerProduct.id}' is missing its subscription reset owner.`,
			});
		}
		if (
			typeof entitlement.allowance !== "number" ||
			!entitlement.interval ||
			(entitlement.interval !== EntInterval.Lifetime &&
				(typeof customerEntitlement.reset_cycle_anchor !== "number" ||
					typeof customerEntitlement.next_reset_at !== "number"))
		) {
			throw new InternalError({
				message: `Pooled prepaid source '${customerProduct.id}' has incomplete reset metadata.`,
			});
		}

		const currentCycleContribution = getStartingBalance({
			entitlement,
			options: updatedOption,
			relatedPrice: customerPrice.price,
			productQuantity: customerProduct.quantity,
		});
		const nextCycleContribution = getStartingBalance({
			entitlement,
			options: {
				...updatedOption,
				quantity: updatedOption.upcoming_quantity ?? updatedOption.quantity,
			},
			relatedPrice: customerPrice.price,
			productQuantity: customerProduct.quantity,
		});

		operations.push({
			op: "upsert_source",
			internalCustomerId: customerProduct.internal_customer_id,
			featureId: entitlement.feature.id,
			internalFeatureId: entitlement.internal_feature_id,
			interval: entitlement.interval,
			intervalCount: entitlement.interval_count ?? 1,
			resetCycleAnchor:
				entitlement.interval === EntInterval.Lifetime
					? null
					: (customerEntitlement.reset_cycle_anchor ?? null),
			nextResetAt:
				entitlement.interval === EntInterval.Lifetime
					? null
					: (customerEntitlement.next_reset_at ?? null),
			rollover: entitlement.rollover ?? null,
			stripeSubscriptionId: subscriptionId,
			customerLicenseLinkId: null,
			sourceCustomerProductId: customerProduct.id,
			sourceEntitlementId: entitlement.id,
			currentCycleContribution,
			nextCycleContribution,
		});
	}

	return operations;
};
