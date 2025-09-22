import { notNullish } from "@/utils/genUtils.js";
import { ProductItem, ProductItemType } from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";

export const isBooleanFeatureItem = (item: ProductItem) => {
	return (
		notNullish(item.feature_id) &&
		(nullish(item.price) || item.price == 0) &&
		nullish(item.tiers) &&
		nullish(item.interval) &&
		nullish(item.included_usage)
	);
};

export const isFeatureItem = (item: ProductItem) => {
	return (
		notNullish(item.feature_id) &&
		(nullish(item.price) || item.price == 0) &&
		nullish(item.tiers)
	);
};

export const isPriceItem = (item: ProductItem) => {
	return notNullish(item.price) && nullish(item.feature_id);
};

export const isFeaturePriceItem = (item: ProductItem) => {
	return (
		notNullish(item.feature_id) &&
		(notNullish(item.price) || notNullish(item.tiers))
	);
};

export const getItemType = (item: ProductItem) => {
	if (isFeatureItem(item)) {
		return ProductItemType.Feature;
	} else if (isFeaturePriceItem(item)) {
		return ProductItemType.FeaturePrice;
	}

	return ProductItemType.Price;
};
