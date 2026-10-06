import {
	type CarryOverUsages,
	deduplicateArray,
	type FullCusProduct,
	type FullCustomerEntitlement,
} from "@autumn/shared";

/** Carries kept usage onto the new row on top of the features it already carries, so renewal bills it there. */
export const keptUsageCarryOverUsages = ({
	replacedCustomerProduct,
	keptCustomerEntitlements,
}: {
	replacedCustomerProduct: FullCusProduct;
	keptCustomerEntitlements: FullCustomerEntitlement[];
}): CarryOverUsages => {
	if (keptCustomerEntitlements.length === 0) return undefined;

	const carriedByDefault = replacedCustomerProduct.customer_entitlements.filter(
		(customerEntitlement) =>
			customerEntitlement.entitlement.carry_from_previous,
	);
	return {
		enabled: true,
		feature_ids: deduplicateArray(
			[...carriedByDefault, ...keptCustomerEntitlements].map(
				(customerEntitlement) => customerEntitlement.entitlement.feature.id,
			),
		),
	};
};
