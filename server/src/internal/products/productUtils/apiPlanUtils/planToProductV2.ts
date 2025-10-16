import { type ProductV2, ProductV2Schema } from "@autumn/shared";
import type { ApiPlan } from "@shared/api/products/apiPlan.js";
import { constructPriceItem } from "../../product-items/productItemUtils.js";
import { planFeaturesToItems } from "./planFeatureUtils/planFeaturesToItems.js";

export const planToProductV2 = ({ plan }: { plan: ApiPlan }): ProductV2 => {
	return ProductV2Schema.parse({
		id: plan.id,
		name: plan.name,
		is_add_on: plan.add_on,
		is_default: plan.default,
		version: plan.version,
		group: plan.group,
		items: [
			...planFeaturesToItems({
				features: plan.features,
			}),
			plan.price
				? constructPriceItem({
						price: plan.price.amount,
						interval: plan.price.interval,
					})
				: undefined,
		],
		archived: plan.archived,
	});
};
