import type { PlanItem } from "../../../compose/models/planModels.js";
import type { ApiPlanItem } from "../../api/types/index.js";
import { createTransformer } from "./Transformer.js";

/**
 * Declarative plan item transformer
 *
 * Maps snake_case API fields to camelCase SDK fields.
 *
 * Handles mutually exclusive reset patterns:
 * - API reset.interval -> SDK top-level reset (when no price, or price without interval)
 * - API price.interval -> SDK price.interval (when price exists)
 */
export const planItemTransformer = createTransformer<
	ApiPlanItem,
	PlanItem
>({
	// rename: maps api snake_case field -> sdk camelCase field (shallow copy)
	rename: {
		feature_id: "featureId",
		entity_feature_id: "entityFeatureId",
	},

	// Only persist unlimited when true (false is implicit default)
	copy: ["unlimited"],
	swapFalse: ["unlimited"],

	// Computed fields
	compute: {
		// Only include included if not unlimited
		included: (api) => (api.unlimited ? undefined : api.included),

		// Top-level reset: only from api.reset when there's no price with interval
		// If price exists with interval, the interval belongs in price.interval, not top-level
		reset: (api) => {
			// If price exists with interval, the reset belongs in price.interval, not top-level
			if (api.price?.interval) {
				return undefined;
			}
			// Only use top-level reset from api.reset
			if (api.reset) {
				return {
					interval: api.reset.interval,
					...(api.reset.interval_count !== undefined && {
						intervalCount: api.reset.interval_count,
					}),
				};
			}
			return undefined;
		},

		// Transform price object with camelCase fields
		price: (api) => {
			if (!api.price) return undefined;

			return {
				amount: api.price.amount,
				tiers: api.price.tiers?.map(
					(tier: { to: number | "inf"; amount: number; flat_amount?: number }) => {
					const t = tier as { to: number | "inf"; amount: number; flat_amount?: number };
					return {
						to: t.to,
						amount: t.amount,
						...(t.flat_amount !== undefined && { flatAmount: t.flat_amount }),
					};
					},
				),
				billingUnits: api.price.billing_units,
				maxPurchase: api.price.max_purchase ?? undefined,
				billingMethod: api.price.billing_method,
				tierBehavior: api.price.tier_behavior,
				// Map API price.interval directly to SDK price.interval
				interval: api.price.interval,
				...(api.price.interval_count !== undefined && {
					intervalCount: api.price.interval_count,
				}),
			};
		},

		// Transform proration object to camelCase
		proration: (api) =>
			api.proration
				? {
						onIncrease: api.proration.on_increase,
						onDecrease: api.proration.on_decrease,
					}
				: undefined,

		// Transform rollover object to camelCase
		rollover: (api) =>
			api.rollover
				? {
						max: api.rollover.max ?? 0,
						expiryDurationType: api.rollover.expiry_duration_type,
						...(api.rollover.expiry_duration_length !== undefined && {
							expiryDurationLength: api.rollover.expiry_duration_length,
						}),
					}
				: undefined,
	},
});

export function transformApiPlanItem(
	apiPlanItem: ApiPlanItem,
): PlanItem {
	return planItemTransformer.transform(apiPlanItem);
}
