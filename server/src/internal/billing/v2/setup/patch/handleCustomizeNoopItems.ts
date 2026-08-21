import {
	type CreatePlanItemParamsV1,
	type CustomizePlanV1,
	type Feature,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullProduct,
	type SharedContext,
	findCustomerEntitlementByFeature,
	findFeatureById,
	isBooleanFeature,
	keepAddEntitlementPricesForLiveRemoves,
} from "@autumn/shared";
import { planItemV1ToPriceAndEnt } from "@shared/api/products/items/mappers/planItemV1ToPriceAndEnt";
import { planItemFilterMatchesCustomerPair } from "@shared/api/products/items/utils/match";

const addItemToEntitlementPrice = ({
	ctx,
	item,
	fullProduct,
}: {
	ctx: SharedContext;
	item: CreatePlanItemParamsV1;
	fullProduct: Pick<FullProduct, "org_id" | "internal_id">;
}) => {
	const { newPrice, newEnt } = planItemV1ToPriceAndEnt({
		ctx,
		item,
		orgId: fullProduct.org_id,
		internalProductId: fullProduct.internal_id,
		isCustom: true,
	});
	const feature = findFeatureById({
		features: ctx.features,
		featureId: item.feature_id,
		errorOnNotFound: true,
	});
	if (!newEnt) return undefined;

	return {
		entitlement: { ...newEnt, feature },
		price: newPrice ?? undefined,
	};
};

const isBooleanAlreadyPresent = ({
	item,
	targetCustomerProduct,
	features,
}: {
	item: CreatePlanItemParamsV1;
	targetCustomerProduct: FullCusProduct;
	features: Feature[];
}) => {
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
	ctx,
	customize,
	targetCustomerProduct,
	deletedCustomerEntitlements,
	fullProduct,
}: {
	ctx: SharedContext;
	customize: CustomizePlanV1;
	targetCustomerProduct: FullCusProduct;
	deletedCustomerEntitlements: FullCustomerEntitlement[];
	fullProduct: Pick<FullProduct, "org_id" | "internal_id">;
}): {
	addItems: CreatePlanItemParamsV1[];
} => {
	const addItems = customize.add_items ?? [];
	const addEntitlementPrices = addItems.map((item) =>
		addItemToEntitlementPrice({ ctx, item, fullProduct }),
	);

	const pairable = addEntitlementPrices.filter(
		(entitlementPrice) => entitlementPrice !== undefined,
	);
	const kept = new Set(
		keepAddEntitlementPricesForLiveRemoves({
			removeItems: customize.remove_items ?? [],
			addEntitlementPrices: pairable,
			removeFilterMatchedLive: ({ filter }) =>
				deletedCustomerEntitlements.some((customerEntitlement) =>
					planItemFilterMatchesCustomerPair({
						filter,
						customerEntitlement,
					}),
				),
		}),
	);

	return {
		addItems: addItems.filter((item, index) => {
			const entitlementPrice = addEntitlementPrices[index];
			if (entitlementPrice && !kept.has(entitlementPrice)) return false;
			return !isBooleanAlreadyPresent({
				item,
				targetCustomerProduct,
				features: ctx.features,
			});
		}),
	};
};
