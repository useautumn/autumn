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

	if (filter.interval !== undefined) {
		const interval =
			customerPrice?.price.config.interval ??
			customerEntitlement?.entitlement.interval ??
			undefined;
		if (String(interval) !== String(filter.interval)) return false;
	}

	return true;
};
