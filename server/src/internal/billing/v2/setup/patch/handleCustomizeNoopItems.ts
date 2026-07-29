import {
	type CreatePlanItemParamsV1,
	type CustomizePlanV1,
	type Feature,
	type FullCusProduct,
	findCustomerEntitlementByFeature,
	findFeatureById,
	isBooleanFeature,
} from "@autumn/shared";

const isNoopAddItem = ({
	item,
	targetCustomerProduct,
	features,
}: {
	item: CreatePlanItemParamsV1;
	targetCustomerProduct: FullCusProduct;
	features: Feature[];
}): boolean => {
	const feature = findFeatureById({
		features,
		featureId: item.feature_id,
	});

	if (!feature || !isBooleanFeature({ feature })) return false;

	return Boolean(
		findCustomerEntitlementByFeature({
			cusEnts: targetCustomerProduct.customer_entitlements,
			feature,
		}),
	);
};

export const handleCustomizeNoopItems = ({
	customize,
	targetCustomerProduct,
	features,
}: {
	customize: CustomizePlanV1;
	targetCustomerProduct: FullCusProduct;
	features: Feature[];
}): {
	addItems: CreatePlanItemParamsV1[];
} => {
	const addItems = (customize.add_items ?? []).filter(
		(item) =>
			!isNoopAddItem({
				item,
				targetCustomerProduct,
				features,
			}),
	);

	return { addItems };
};
