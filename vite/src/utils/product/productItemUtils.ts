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

const itemIsUnlimited = (item: ProductItem) => {
	return item.included_usage === Infinite;
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

const getShowParams = (item: ProductItem | null) => {
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

const shouldShowProrationConfig = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	if (!isFeaturePriceItem(item)) return false;

	const usageType = itemToUsageType({ item, features });

	if (item.usage_model === UsageModel.Prepaid) return true;

	if (usageType === ProductItemFeatureType.ContinuousUse) {
		return true;
	}
	return false;
};

const itemsHaveSameInterval = ({
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

const intervalSuffix = (item: ProductItem): string => {
	const interval = item.price_interval ?? item.interval;
	if (!interval) return "-oneoff";
	const intervalCount = item.price_interval
		? item.price_interval_count
		: item.interval_count;
	const count = intervalCount && intervalCount !== 1 ? `x${intervalCount}` : "";
	return `-${interval}${count}`;
};

export const getItemId = ({
	item,
	itemIndex,
}: {
	item: ProductItem;
	itemIndex: number;
}) => {
	if (item._uid) return `uid-${item._uid}`;

	const interval = intervalSuffix(item);
	if (item.entitlement_id) return `ent-${item.entitlement_id}${interval}`;
	if (item.price_id) return `price-${item.price_id}${interval}`;
	if (item.feature_id) {
		const base = item.entity_feature_id
			? `feature-${item.feature_id}-${item.entity_feature_id}`
			: `feature-${item.feature_id}`;
		return `${base}${interval}`;
	}
	return `item-${itemIndex}`;
};

export const stripEditorFields = ({
	items,
}: {
	items: ProductItem[] | undefined;
}): ProductItem[] | undefined =>
	items?.map(({ _uid, ...item }) => item as ProductItem);

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
