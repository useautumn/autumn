import type {
	CustomizePlanV1,
	Entitlement,
	EntitlementWithFeature,
	FullProduct,
	Price,
	SharedContext,
} from "@autumn/shared";
import { planItemV1ToPriceAndEnt } from "@shared/api/products/items/mappers/planItemV1ToPriceAndEnt";
import type { ReusePricesAndEntitlements } from "./types";

export const handleCustomizeAddItems = ({
	ctx,
	customize,
	fullProduct,
	reusePricesAndEntitlements,
}: {
	ctx: SharedContext;
	customize: CustomizePlanV1;
	fullProduct: FullProduct;
	reusePricesAndEntitlements?: ReusePricesAndEntitlements;
}): {
	prices: Price[];
	entitlements: Entitlement[];
} => {
	const prices: Price[] = [];
	const entitlements: Entitlement[] = [];

	for (const item of customize.add_items ?? []) {
		const overridePrice = item.price_id
			? reusePricesAndEntitlements?.pricesById.get(item.price_id)
			: undefined;
		const overrideEntitlement = item.entitlement_id
			? reusePricesAndEntitlements?.entitlementsById.get(item.entitlement_id)
			: undefined;

		if (overridePrice || overrideEntitlement) {
			if (overridePrice) prices.push(overridePrice);
			if (overrideEntitlement) entitlements.push(overrideEntitlement);
			continue;
		}

		const { newPrice, newEnt } = planItemV1ToPriceAndEnt({
			ctx,
			item,
			orgId: fullProduct.org_id,
			internalProductId: fullProduct.internal_id,
			isCustom: true,
		});

		if (newPrice) prices.push(newPrice);
		if (newEnt) entitlements.push(newEnt);
	}

	const entitlementsWithFeatures: EntitlementWithFeature[] = entitlements.map(
		(entitlement) => ({
			...entitlement,
			feature: ctx.features.find(
				(feature) => feature.internal_id === entitlement.internal_feature_id,
			)!,
		}),
	);

	fullProduct.prices.push(...prices);
	fullProduct.entitlements.push(...entitlementsWithFeatures);

	return { prices, entitlements };
};
