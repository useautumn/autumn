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
import { handleCustomizeDeleteItems } from "@/internal/billing/v2/setup/patch/handleCustomizeDeleteItems.js";

const getAddItemEntitlementInterval = ({
	item,
}: {
	item: CreatePlanItemParamsV1;
}): EntInterval =>
	(item.reset?.interval ??
		item.price?.interval ??
		EntInterval.Lifetime) as EntInterval;

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
	const remainingCustomerProduct = removeItems?.length
		? {
				...customerProduct,
				customer_prices: [...customerProduct.customer_prices],
				customer_entitlements: [...customerProduct.customer_entitlements],
			}
		: customerProduct;
	if (removeItems?.length) {
		handleCustomizeDeleteItems({
			customize: { remove_items: removeItems },
			targetCustomerProduct: remainingCustomerProduct,
		});
	}

	const feature = findFeatureById({
		features: ctx.features,
		featureId: item.feature_id,
		errorOnNotFound: true,
	});

	if (isBooleanFeature({ feature })) {
		return Boolean(
			findCustomerEntitlementByFeature({
				cusEnts: remainingCustomerProduct.customer_entitlements,
				featureId: item.feature_id,
			}),
		);
	}

	const itemInterval = getAddItemEntitlementInterval({ item });

	return remainingCustomerProduct.customer_entitlements.some(
		(customerEntitlement) =>
			customerEntitlement.feature_id === item.feature_id &&
			String(
				customerEntitlement.entitlement.interval ?? EntInterval.Lifetime,
			) === String(itemInterval),
	);
};
