import {
	type CarryOverUsages,
	type FullCusEntWithFullCusProduct,
	featureUtils,
	isBooleanFeature,
} from "@autumn/shared";

/** Usage carry_over_usages moves onto the replacing plan, so the switch must not also bill it. */
export const carriesOverUsage = ({
	carryOverUsages,
	sourceCustomerProductIds,
	customerEntitlement,
}: {
	carryOverUsages: CarryOverUsages;
	sourceCustomerProductIds: Set<string>;
	customerEntitlement: FullCusEntWithFullCusProduct;
}): boolean => {
	if (!carryOverUsages?.enabled) return false;

	const sourceCustomerProductId = customerEntitlement.customer_product?.id;
	if (!sourceCustomerProductId) return false;
	if (!sourceCustomerProductIds.has(sourceCustomerProductId)) return false;

	const { feature } = customerEntitlement.entitlement;
	if (isBooleanFeature({ feature }) || featureUtils.isAllocated(feature))
		return false;

	return (
		!carryOverUsages.feature_ids ||
		carryOverUsages.feature_ids.includes(feature.id)
	);
};
