import type { Feature, ProductItem } from "@autumn/shared";
import { ProductItemFeatureType, UsageModel } from "@autumn/shared";
import { itemToUsageType } from "./convertItem.js";

export const itemCanBeProrated = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const usageType = itemToUsageType({ item, features });

	if (
		usageType === ProductItemFeatureType.SingleUse &&
		item.usage_model === UsageModel.Prepaid
	) {
		return true;
	} else if (usageType === ProductItemFeatureType.ContinuousUse) {
		return true;
	}

	return false;
};
