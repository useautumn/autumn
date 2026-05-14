import {
	EntInterval,
	type FullCusProduct,
	findCustomerEntitlementByFeature,
	findFeatureById,
	isBooleanFeature,
} from "@autumn/shared";
import type { CreatePlanItemParamsV1 } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1.js";
import type { PlanItemFilter } from "@autumn/shared/api/products/items/filter/planItemFilter.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const getAddItemEntitlementInterval = ({
	item,
}: {
	item: CreatePlanItemParamsV1;
}): EntInterval =>
	(item.reset?.interval ??
		item.price?.interval ??
		EntInterval.Lifetime) as EntInterval;

const itemWillReplaceRemovedItem = ({
	item,
	removeItems,
}: {
	item: CreatePlanItemParamsV1;
	removeItems?: PlanItemFilter[];
}) => {
	if (!removeItems?.length) return false;

	const itemInterval = getAddItemEntitlementInterval({ item });

	return removeItems.some((removeItem) => {
		if (
			removeItem.feature_id !== undefined &&
			removeItem.feature_id !== item.feature_id
		) {
			return false;
		}

		if (
			removeItem.interval !== undefined &&
			String(removeItem.interval) !== String(itemInterval)
		) {
			return false;
		}

		return true;
	});
};

export const itemAlreadyExists = ({
	ctx,
	customerProduct,
	item,
	removeItems,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	item: CreatePlanItemParamsV1;
	removeItems?: PlanItemFilter[];
}): boolean => {
	if (itemWillReplaceRemovedItem({ item, removeItems })) return false;

	const feature = findFeatureById({
		features: ctx.features,
		featureId: item.feature_id,
		errorOnNotFound: true,
	});

	if (isBooleanFeature({ feature })) {
		return Boolean(
			findCustomerEntitlementByFeature({
				cusEnts: customerProduct.customer_entitlements,
				featureId: item.feature_id,
			}),
		);
	}

	const itemInterval = getAddItemEntitlementInterval({ item });

	return customerProduct.customer_entitlements.some(
		(customerEntitlement) =>
			customerEntitlement.feature_id === item.feature_id &&
			String(
				customerEntitlement.entitlement.interval ?? EntInterval.Lifetime,
			) === String(itemInterval),
	);
};
