import {
	customerProductHasActiveStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { customerEntitlementCompetes } from "./customerEntitlementCompetes";

/** The max / min features a transition moves: its incoming competing grants and outgoing competing shares. */
export const competingFeatureIdsOf = ({
	incomingCustomerProducts,
	outgoingCustomerProducts,
}: {
	incomingCustomerProducts: FullCusProduct[];
	outgoingCustomerProducts: FullCusProduct[];
}): Set<string> => {
	const featureIds = new Set<string>();
	for (const customerProduct of incomingCustomerProducts) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			if (customerEntitlementCompetes({ customerEntitlement, customerProduct }))
				featureIds.add(customerEntitlement.entitlement.internal_feature_id);
		}
	}
	for (const customerProduct of outgoingCustomerProducts) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			if (customerEntitlement.pooled_balance_contribution?.competes)
				featureIds.add(customerEntitlement.entitlement.internal_feature_id);
		}
	}
	return featureIds;
};

/**
 * Plans the customer already holds whose grants should compete but were attached before the
 * feature was set to max / min: they join the pool the next time a transition moves that feature.
 */
export const unpooledCompetingCustomerProducts = ({
	fullCustomer,
	featureIds,
	excludedCustomerProductIds,
}: {
	fullCustomer: FullCustomer;
	featureIds: Set<string>;
	excludedCustomerProductIds: Set<string>;
}): FullCusProduct[] => {
	if (featureIds.size === 0) return [];
	return fullCustomer.customer_products.flatMap((customerProduct) => {
		if (excludedCustomerProductIds.has(customerProduct.id)) return [];
		if (!customerProductHasActiveStatus(customerProduct)) return [];

		const unpooled = (customerProduct.customer_entitlements ?? []).filter(
			(customerEntitlement) =>
				!customerEntitlement.pooled_contribution_id &&
				featureIds.has(customerEntitlement.entitlement.internal_feature_id) &&
				customerEntitlementCompetes({ customerEntitlement, customerProduct }),
		);
		return unpooled.length > 0
			? [{ ...customerProduct, customer_entitlements: unpooled }]
			: [];
	});
};
