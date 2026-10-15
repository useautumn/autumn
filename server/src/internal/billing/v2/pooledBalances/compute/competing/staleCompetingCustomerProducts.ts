import {
	customerProductHasActiveStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import { customerEntitlementCompetes } from "./customerEntitlementCompetes";

/** The max / min features a transition moves: grants on its incoming or outgoing plans that compete now or did before. */
export const competingFeatureIdsOf = ({
	incomingCustomerProducts,
	outgoingCustomerProducts,
}: {
	incomingCustomerProducts: FullCusProduct[];
	outgoingCustomerProducts: FullCusProduct[];
}): Set<string> => {
	const featureIds = new Set<string>();
	for (const customerProduct of [
		...incomingCustomerProducts,
		...outgoingCustomerProducts,
	]) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			if (
				customerEntitlement.pooled_balance_contribution?.competes ||
				customerEntitlementCompetes({ customerEntitlement, customerProduct })
			)
				featureIds.add(customerEntitlement.entitlement.internal_feature_id);
		}
	}
	return featureIds;
};

/** Should compete but doesn't yet: never pooled, or pooled as an additive share before the switch to max / min. */
const competesButIsNotCompeting = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
}) => {
	if (customerEntitlement.pooled_balance_contribution?.competes) return false;
	return customerEntitlementCompetes({ customerEntitlement, customerProduct });
};

/**
 * Plans the customer already holds whose grants should compete but were attached before the
 * feature was set to max / min: they join the pool the next time a transition moves that feature.
 */
export const staleCompetingCustomerProducts = ({
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

		const stale = (customerProduct.customer_entitlements ?? []).filter(
			(customerEntitlement) =>
				featureIds.has(customerEntitlement.entitlement.internal_feature_id) &&
				competesButIsNotCompeting({ customerEntitlement, customerProduct }),
		);
		return stale.length > 0
			? [{ ...customerProduct, customer_entitlements: stale }]
			: [];
	});
};
