import {
	addCusProductToCusEnt,
	cusEntToCusPrice,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isBooleanEntitlement,
	isCompetingCombineFeature,
	isEntityScopedEntitlement,
} from "@autumn/shared";

/** Under a max / min feature, a customer-level grant with no price competes; entity, license and priced grants add up. */
export const customerEntitlementCompetes = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
}): boolean => {
	const { entitlement } = customerEntitlement;
	if (!isCompetingCombineFeature({ feature: entitlement.feature }))
		return false;
	if (isBooleanEntitlement({ entitlement })) return false;
	if (isEntityScopedEntitlement({ entitlement })) return false;
	if (
		customerProduct.internal_entity_id ||
		customerEntitlement.internal_entity_id
	)
		return false;
	if (customerProduct.customer_license_link_id) return false;

	const customerPrice = cusEntToCusPrice({
		cusEnt: addCusProductToCusEnt({
			cusEnt: customerEntitlement,
			cusProduct: customerProduct,
		}),
	});
	return customerPrice === undefined;
};
