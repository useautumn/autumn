import type { FullCusProduct, PatchContext } from "@autumn/shared";

export const getPatchCarryCustomerProduct = ({
	patchContext,
}: {
	patchContext: PatchContext;
}): FullCusProduct => {
	const deletedEntitlementIds = new Set(
		patchContext.deleteCustomerEntitlements.map(
			(customerEntitlement) => customerEntitlement.entitlement.id,
		),
	);
	const deletedCustomerPriceIds = new Set(
		patchContext.deleteCustomerPrices.map((customerPrice) => customerPrice.id),
	);

	return {
		...patchContext.originalCustomerProduct,
		customer_prices:
			patchContext.originalCustomerProduct.customer_prices.filter(
				(customerPrice) =>
					deletedCustomerPriceIds.has(customerPrice.id) ||
					(customerPrice.price.entitlement_id
						? deletedEntitlementIds.has(customerPrice.price.entitlement_id)
						: false),
			),
		customer_entitlements: patchContext.deleteCustomerEntitlements,
	};
};
