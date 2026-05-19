import { BillingMethod } from "../../../api/products/components/billingMethod.js";
import type { PlanItemFilter } from "../../../api/products/items/filter/planItemFilter.js";
import {
	type ProductItem,
	UsageModel,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";

const usageModelToBillingMethod = (
	usageModel: ProductItem["usage_model"],
): BillingMethod | undefined => {
	if (usageModel === UsageModel.Prepaid) return BillingMethod.Prepaid;
	if (usageModel === UsageModel.PayPerUse) return BillingMethod.UsageBased;
	return undefined;
};

export const matchesPlanItemFilter = ({
	item,
	filter,
}: {
	item: ProductItem;
	filter: PlanItemFilter;
}): boolean => {
	if (filter.feature_id !== undefined && item.feature_id !== filter.feature_id)
		return false;

	if (filter.billing_method !== undefined) {
		const itemBillingMethod = usageModelToBillingMethod(item.usage_model);
		if (itemBillingMethod !== filter.billing_method) return false;
	}

	if (
		filter.interval !== undefined &&
		String(item.interval) !== String(filter.interval)
	)
		return false;

	if (
		filter.interval_count !== undefined &&
		(item.interval_count ?? 1) !== filter.interval_count
	)
		return false;

	return true;
};
