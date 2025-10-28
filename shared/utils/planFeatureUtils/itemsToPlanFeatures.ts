import type { ResetInterval } from "@api/models.js";
import {
	type ApiPlanFeature,
	ApiPlanFeatureSchema,
} from "@api/products/planFeature/apiPlanFeature.js";
import type { BillingInterval } from "@models/productModels/priceModels/priceEnums.js";
import { Infinite } from "@models/productModels/productEnums.js";
import {
	type ProductItem,
	TierInfinite,
	type UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import {
	itemIntvToResetIntv,
	rolloverToResetIntv,
} from "./planFeatureIntervals.js";

/**
 * Convert Product items back to Plan features for API responses
 */
export const itemsToPlanFeatures = ({
	items,
}: {
	items: ProductItem[];
}): ApiPlanFeature[] => {
	return (items ?? []).map((item) => {
		// Check if item has pricing (determines where interval goes)
		const hasPrice =
			(item.price && item.price > 0) ||
			(item.tiers && item.tiers.length > 0) ||
			item.usage_model;

		return ApiPlanFeatureSchema.parse({
			feature_id: item.feature_id!,

			// Handle unlimited vs granted
			granted_balance:
				item.included_usage === Infinite ? 0 : (item.included_usage ?? 0),

			unlimited: item.included_usage === Infinite,

			// Conditionally set reset_interval OR price.interval (mutually exclusive)
			// If has pricing: interval goes in price
			// If no pricing: interval goes in reset_interval
			...(!hasPrice && item.interval
				? {
						reset_interval: itemIntvToResetIntv(
							item.interval!,
						) as ResetInterval,
						...(item.interval_count !== undefined &&
						item.interval_count !== null
							? {
									reset_interval_count: item.interval_count,
								}
							: {}),
					}
				: {}),

			// Convert price if exists
			...(hasPrice
				? (() => {
						// Check if this is a single tier to infinity (stored as tier but should be flat amount)
						const isSingleTierToInf =
							item.tiers &&
							item.tiers.length === 1 &&
							item.tiers[0].to === TierInfinite;

						return {
							price: {
								interval: (item.interval || "month") as BillingInterval,
								billing_units: item.billing_units ?? 1,
								usage_model: (item.usage_model || "pay_per_use") as UsageModel,
								max_purchase: 1,
								// If single tier to infinity, extract amount; otherwise use item.price
								amount: isSingleTierToInf
									? item.tiers![0].amount
									: item.price || 0,
								// Only include tiers if multi-tier
								...(item.tiers && item.tiers.length > 1
									? {
											tiers: item.tiers.map((tier) => ({
												to: tier.to === TierInfinite ? TierInfinite : tier.to,
												amount: tier.amount,
											})),
										}
									: {}),
								interval_count: item.interval_count ?? undefined,
							},
						};
					})()
				: {}),

			// Convert rollover config
			...(item.config?.rollover
				? {
						rollover: {
							max: item.config.rollover.max ?? null,
							expiry_duration_type: rolloverToResetIntv(
								item.config.rollover.duration,
							),
							expiry_duration_length: item.config.rollover.length,
						},
					}
				: {}),

			// Convert proration config
			...(item.config?.on_increase || item.config?.on_decrease
				? {
						proration: {
							on_increase: item.config.on_increase ?? undefined,
							on_decrease: item.config.on_decrease ?? undefined,
						},
					}
				: {}),

			// Other fields
			// reset_usage_on_enabled: item.reset_usage_when_enabled ?? true,
			// entity_feature_id: item.entity_feature_id,
		} satisfies ApiPlanFeature);
	});
};
