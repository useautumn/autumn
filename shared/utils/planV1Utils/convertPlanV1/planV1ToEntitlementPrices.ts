import { planV1ToProductItems } from "@api/products/mappers/planV1ToProductItems.js";
import type { BasePriceParams } from "@api/products/components/basePrice/basePrice.js";
import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1.js";
import type { ApiPlanItemV1 } from "@api/products/items/apiPlanItemV1.js";
import type { ApiPlan } from "@api/products/previousVersions/apiPlanV0.js";
import type { SharedContext } from "../../../types/index.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import type { Product } from "../../../models/productModels/productModels.js";
import type { BasePriceAndEntitlementPrices } from "@utils/productUtils/entitlementPriceUtils/entitlementPriceTypes.js";
import { productItemsToEntitlementPrices } from "./productItemsToEntitlementPrices.js";

/**
 * PlanV1 price + items → minted base Price + EntitlementPrices.
 * ProductItem is an interim that dies inside this convert.
 */
export const planV1ToEntitlementPrices = ({
	ctx,
	product,
	basePrice,
	planItems,
	features,
}: {
	ctx: SharedContext;
	product: Pick<Product, "org_id" | "internal_id">;
	basePrice?: BasePriceParams | ApiPlan["price"] | null;
	planItems: ApiPlanItemV1[] | CreatePlanItemParamsV1[];
	/** Feature working set used to stamp entitlements (defaults to ctx.features). */
	features?: Feature[];
}): BasePriceAndEntitlementPrices => {
	const items = planV1ToProductItems({
		ctx,
		plan: {
			price: basePrice ?? null,
			items: planItems,
		},
	});

	return productItemsToEntitlementPrices({
		items,
		product,
		features: features ?? ctx.features,
	});
};
