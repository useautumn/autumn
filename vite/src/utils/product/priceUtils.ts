import {
	AllowanceType,
	BillingInterval,
	BillWhen,
	type EntitlementWithFeature,
	PriceType,
	type ProductItem,
	type UsagePriceConfig,
} from "@autumn/shared";
import { isFeatureItem } from "./getItemType";
import { intervalIsNone } from "./productItemUtils";

export const getBillingUnits = (
	config: UsagePriceConfig,
	entitlements: EntitlementWithFeature[],
) => {
	if (!entitlements) return "(error)";

	if (
		config.bill_when === BillWhen.EndOfPeriod ||
		config.bill_when === BillWhen.StartOfPeriod ||
		config.bill_when === BillWhen.InAdvance
	) {
		return `${config.billing_units} `;
	}

	const entitlement = entitlements?.find(
		(e) => e.internal_feature_id === config?.internal_feature_id,
	);
	if (!entitlement) return "n";

	if (entitlement.allowance_type === AllowanceType.Unlimited) return "∞";
	if (entitlement.allowance_type === AllowanceType.None) return "n";

	return `${entitlement.allowance} `;
};

export const getDefaultPriceConfig = (type: PriceType) => {
	if (type === PriceType.Fixed) {
		return {
			type: PriceType.Fixed,
			amount: "",
			interval: BillingInterval.Month,
			interval_count: 1,
		};
	}

	return {
		type: PriceType.Usage,
		internal_feature_id: "",
		feature_id: "",
		bill_when: BillWhen.EndOfPeriod,
		interval: BillingInterval.Month,
		interval_count: 1,
		billing_units: 1,
		usage_tiers: [
			{
				from: 0,
				to: "",
				amount: 0.0,
			},
		],
		should_prorate: false,
	};
};

export const isOneOffProduct = (
	items: ProductItem[],
	isAddOn: boolean = false,
) => {
	const prices = items.filter((item) => !isFeatureItem(item));

	if (prices.length === 0 && isAddOn) return true;
	if (prices.length === 0) return false;

	return prices.every((price) => {
		return intervalIsNone(price.interval);
	});
};

export const isFreeProduct = (items: ProductItem[]) => {
	return items.every((item) => isFeatureItem(item));
};
