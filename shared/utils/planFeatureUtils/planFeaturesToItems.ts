import type { ResetInterval } from "@api/models.js";
import type { ApiPlanFeature } from "@api/products/planFeature/apiPlanFeature.js";
import {
	type ProductItem,
	ProductItemSchema,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import type { UpdatePlanFeatureParams } from "../../api/products/planFeature/planFeatureOpModels.js";
import {
	resetIntvToItemIntv,
	resetIntvToRollover,
} from "./planFeatureIntervals.js";

export const planFeaturesToItems = ({
	features,
}: {
	features: (ApiPlanFeature | UpdatePlanFeatureParams)[];
}): ProductItem[] =>
	(features ?? []).map((feature) => {
		// // Determine interval: use reset_interval if present, otherwise use price.interval
		// const interval = feature.reset?.interval
		// 	? resetIntvToItemIntv(feature.reset.interval as ResetInterval)
		// 	: feature.price?.interval
		// 		? (feature.price.interval as any)
		// 		: null;

		return ProductItemSchema.parse({
			feature_id: feature.feature_id,
			// included_usage: feature.unlimited ? Infinite : feature.granted,
			interval: resetIntvToItemIntv(feature.reset?.interval as ResetInterval),
			interval_count: feature.reset?.interval_count,

			config: {
				rollover: feature.rollover
					? {
							max: feature.rollover.max,
							duration: resetIntvToRollover(
								feature.rollover.expiry_duration_type,
							),
							length: feature.rollover.expiry_duration_length ?? 0,
						}
					: undefined,
				on_increase: feature.proration?.on_increase,
				on_decrease: feature.proration?.on_decrease,
			},

			price: feature.price?.amount,

			tiers: feature.price?.tiers?.map((tier) => ({
				amount: tier.amount,
				to: tier.to,
			})),

			usage_model: feature.price?.usage_model,
			billing_units: feature.price?.billing_units,
			usage_limit: feature.price?.max_purchase
				? feature.price.max_purchase + (feature.granted_balance ?? 0)
				: undefined,
			reset_usage_when_enabled: feature.reset?.reset_when_enabled,
		} satisfies ProductItem);
	});
