import { BillingMethod } from "@api/products/components/billingMethod";
import type { PlanItemFilter } from "@api/products/items/filter/planItemFilter";
import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCustomerPrice } from "@models/cusProductModels/cusPriceModels/cusPriceModels";
import { BillingType } from "@models/productModels/priceModels/priceEnums";
import { getBillingType } from "@utils/productUtils/priceUtils";

const customerPriceToBillingMethod = ({
	customerPrice,
}: {
	customerPrice?: FullCustomerPrice;
}): BillingMethod | undefined => {
	if (!customerPrice) return undefined;

	const billingType = getBillingType(customerPrice.price.config);
	if (billingType === BillingType.UsageInAdvance) return BillingMethod.Prepaid;
	if (
		billingType === BillingType.UsageInArrear ||
		billingType === BillingType.InArrearProrated
	)
		return BillingMethod.UsageBased;

	return undefined;
};

const intervalSideMatchesFilter = ({
	interval,
	intervalCount,
	filter,
}: {
	interval?: string | null;
	intervalCount?: number | null;
	filter: PlanItemFilter;
}) => {
	if (
		filter.interval !== undefined &&
		String(interval) !== String(filter.interval)
	)
		return false;

	if (
		filter.interval_count !== undefined &&
		(intervalCount ?? 1) !== filter.interval_count
	)
		return false;

	return true;
};

export const planItemFilterMatchesCustomerPair = ({
	filter,
	customerPrice,
	customerEntitlement,
}: {
	filter: PlanItemFilter;
	customerPrice?: FullCustomerPrice;
	customerEntitlement?: FullCustomerEntitlement;
}): boolean => {
	const featureId =
		customerEntitlement?.entitlement.feature.id ??
		customerPrice?.price.config.feature_id ??
		undefined;

	if (filter.feature_id !== undefined && featureId !== filter.feature_id)
		return false;

	if (filter.billing_method !== undefined) {
		const billingMethod = customerPriceToBillingMethod({ customerPrice });
		if (billingMethod !== filter.billing_method) return false;
	}

	if (filter.interval !== undefined || filter.interval_count !== undefined) {
		const priceMatches =
			!!customerPrice &&
			intervalSideMatchesFilter({
				interval: customerPrice.price.config.interval,
				intervalCount: customerPrice.price.config.interval_count,
				filter,
			});
		const resetMatches =
			!!customerEntitlement &&
			intervalSideMatchesFilter({
				interval: customerEntitlement.entitlement.interval,
				intervalCount: customerEntitlement.entitlement.interval_count,
				filter,
			});

		if (!priceMatches && !resetMatches) return false;
	}

	return true;
};
