import { billingMethodToUsageModel } from "@api/products/components/mappers/billingMethodTousageModel.js";
import type { ApiPlanItemV0 } from "@api/products/items/previousVersions/apiPlanItemV0.js";
import type { ApiPlanItemV1 } from "../apiPlanItemV1.js";

/** Transform ApiPlanItemV1 to ApiPlanItemV0 */
export function planItemV1ToV0(item: ApiPlanItemV1): ApiPlanItemV0 {
	const { included, price, ...restItem } = item;
	return {
		...restItem,
		granted_balance: included,
		reset: item.reset
			? {
					interval: item.reset.interval,
					interval_count: item.reset.interval_count,
					reset_when_enabled: false,
				}
			: null,
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
}
