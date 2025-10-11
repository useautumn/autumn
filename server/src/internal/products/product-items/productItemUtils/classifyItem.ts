import {
	type Feature,
	type ProductItem,
	ProductItemFeatureType,
	UsageModel,
} from "@autumn/shared";
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
		usageType == ProductItemFeatureType.SingleUse &&
		item.usage_model == UsageModel.Prepaid
	) {
		return true;
	} else if (usageType == ProductItemFeatureType.ContinuousUse) {
		return true;
	}

	return false;
};
