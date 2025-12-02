import {
	BillingInterval,
	EntInterval,
	type Feature,
	Infinite,
	type ProductItem,
	ProductItemFeatureType,
	ProductItemType,
	type ProductV2,
	UsageModel,
} from "@autumn/shared";
import { notNullish, nullish } from "../genUtils";
import { isFeatureItem, isFeaturePriceItem, isPriceItem } from "./getItemType";
import { itemToUsageType } from "./productItemUtils/convertItem";

export const itemIsUnlimited = (item: ProductItem) => {
	return item.included_usage === Infinite;
};

export const formatAmount = ({
	defaultCurrency,
	amount,
	maxFractionDigits = 6,
}: {
	defaultCurrency: string;
	amount: number;
	maxFractionDigits?: number;
}) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: defaultCurrency,
		minimumFractionDigits: 0,
		maximumFractionDigits: maxFractionDigits || 6,
	}).format(amount);
};

export const getItemType = (item: ProductItem) => {
	if (isPriceItem(item)) {
		return ProductItemType.Price;
	} else if (isFeatureItem(item)) {
		return ProductItemType.Feature;
	}

	return ProductItemType.FeaturePrice;
};

export const intervalIsNone = (
	interval: EntInterval | BillingInterval | null | undefined,
) => {
	return (
		nullish(interval) ||
		interval === EntInterval.Lifetime ||
		interval === BillingInterval.OneOff
	);
};

export const getShowParams = (item: ProductItem | null) => {
	if (!item) {
		return {
			price: false,
			feature: false,
			allowance: false,
			perEntity: false,
			cycle: false,
		};
	}

	return {
		price: notNullish(item.price) || notNullish(item.tiers),
		feature: !isPriceItem(item),
		allowance: true,
		perEntity: notNullish(item.entity_feature_id),
		cycle: true,
	};
};

export const shouldShowProrationConfig = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	if (!isFeaturePriceItem(item)) return false;

	// If pay per use single use
	const usageType = itemToUsageType({ item, features });

	if (item.usage_model === UsageModel.Prepaid) return true;

	// if (
	//   usageType == ProductItemFeatureType.SingleUse &&
	//   item.usage_model == UsageModel.Prepaid
	// ) {
	//   return true;
	// } else

	if (
		usageType === ProductItemFeatureType.ContinuousUse
		// &&item.usage_model !== UsageModel.Prepaid
	) {
		return true;
	}
	return false;
};

export const itemsHaveSameInterval = ({
	item1,
	item2,
}: {
	item1: ProductItem;
	item2: ProductItem;
}) => {
	return (
		item1.interval === item2.interval &&
		(item1.interval_count || 1) === (item2.interval_count || 1)
	);
};

export const getItemId = ({
	item,
	itemIndex,
}: {
	item: ProductItem;
	itemIndex: number;
}) => {
	// || item.entitlement_id || item.price_id;
	return `item-${itemIndex}`;
};

export const getPrepaidItems = (product: ProductV2 | undefined) => {
	if (!product) return [];

	return (
		product.items?.filter(
			(productItem) =>
				productItem.usage_model === UsageModel.Prepaid &&
				productItem.feature_id,
		) || []
	);
};
