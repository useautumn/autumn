import {
	type CreateProductV2Params,
	CreateProductV2ParamsSchema,
} from "@autumn/shared";
import type { ApiPlan } from "@shared/api/products/apiPlan.js";
import { constructPriceItem } from "../../product-items/productItemUtils.js";
import { planFeaturesToItems } from "./planFeatureUtils/planFeaturesToItems.js";

export const planToProductV2 = ({
	plan,
}: {
	plan: ApiPlan;
}): CreateProductV2Params => {
	try {
		const featureItems = planFeaturesToItems({
			features: plan.features,
		});

		const items = [...featureItems];

		// Only add price item if there isn't a price on a feature already (aka: a "base price" product)
		const hasPriceItem = featureItems?.some(
			(item) => typeof item.price === "number" && item.price > 0,
		);

		if (plan.price && !hasPriceItem) {
			items.push(
				constructPriceItem({
					price: plan.price.amount,
					interval: plan.price.interval,
				}),
			);
		}

		return CreateProductV2ParamsSchema.parse({
			id: plan.id,
			name: plan.name,
			is_add_on: plan.add_on,
			is_default: plan.default,
			version: plan.version,
			group: plan.group ?? "",
			items,
			free_trial: plan.free_trial
				? {
						duration: plan.free_trial.duration_type,
						length: plan.free_trial.duration_length,
						unique_fingerprint: false,
						card_required: plan.free_trial.card_required,
					}
				: null,
		} satisfies CreateProductV2Params);
	} catch (error) {
		console.error("Error converting plan to product V2:", error);
		throw error;
	}
};
