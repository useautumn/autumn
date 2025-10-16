import {
	type ApiPlanFeature,
	ApiPlanFeatureSchema,
	Infinite,
	type ProductItem,
	type ResetInterval,
} from "@autumn/shared";
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
	return items.map((item) =>
		ApiPlanFeatureSchema.parse({
			feature_id: item.feature_id!,

			// Handle unlimited vs granted
			granted:
				item.included_usage === Infinite ? 0 : (item.included_usage ?? 0),
			unlimited: item.included_usage === Infinite,

			// Convert intervals
			reset_interval: item.interval
				? (itemIntvToResetIntv(item.interval!) as ResetInterval)
				: undefined,
			reset_interval_count: item.interval_count ?? undefined,

			// Convert price if exists
			price: item.price
				? {
						amount: item.price,
						tiers: item.tiers?.map((tier) => ({
							amount: tier.amount,
							to: tier.to === "inf" ? null : tier.to,
						})),
						interval: item.interval, // Billing interval (might need conversion)
						interval_count: item.interval_count,
						billing_units: item.billing_units,
						usage_model: item.usage_model,
						max_purchase: item.usage_limit
							? item.usage_limit -
								(item.included_usage === Infinite
									? 0
									: (item.included_usage ?? 0))
							: undefined,
					}
				: undefined,

			// Convert rollover config
			...(item.config?.rollover
				? [
						{
							rollover: {
								max: item.config.rollover.max ?? null,
								expiry_duration_type: rolloverToResetIntv(
									item.config.rollover.duration,
								),
								expiry_duration_length: item.config.rollover.length,
							},
						},
					]
				: []),

			// Convert proration config
			...(item.config?.on_increase || item.config?.on_decrease
				? [
						{
							proration: {
								on_increase: item.config.on_increase ?? undefined,
								on_decrease: item.config.on_decrease ?? undefined,
							},
						},
					]
				: []),

			// Other fields
			reset_usage_on_enabled: item.reset_usage_when_enabled ?? true,
			entity_feature_id: item.entity_feature_id,
		} satisfies ApiPlanFeature),
	);
};
