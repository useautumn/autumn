import type { ApiPlan } from "@api/products/apiPlan.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import {
	BillingMethod,
	UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels.js";

/**
 * Convert billing_method (V2.1) to usage_model (V2.0)
 */
export function billingMethodToUsageModel(
	billingMethod: BillingMethod,
): UsageModel {
	return billingMethod === BillingMethod.Prepaid
		? UsageModel.Prepaid
		: UsageModel.PayPerUse;
}

/**
 * Transform ApiPlanV1 (V2.1) to ApiPlan (V2.0)
 *
 * Handles the following conversions:
 * - auto_enable -> default
 * - included -> granted_balance
 * - Adds reset_when_enabled (defaults to false)
 * - billing_method -> usage_model
 */
export function transformPlanV1ToV0(plan: ApiPlanV1): ApiPlan {
	return {
		...plan,
		default: plan.auto_enable,
		features: plan.features.map((feature) => {
			const { included, price, ...restFeature } = feature;
			return {
				...restFeature,
				granted_balance: included,
				reset: feature.reset
					? {
							interval: feature.reset.interval,
							interval_count: feature.reset.interval_count,
							reset_when_enabled: false,
						}
					: null,
				// Convert price: billing_method (V2.1) -> usage_model (V2.0)
				price: price
					? {
							amount: price.amount,
							tiers: price.tiers,
							interval: price.interval,
							interval_count: price.interval_count,
							billing_units: price.billing_units,
							usage_model: billingMethodToUsageModel(price.billing_method),
							max_purchase: price.max_purchase,
						}
					: null,
			};
		}),
	};
}
