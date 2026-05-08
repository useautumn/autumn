import type { Feature } from "../../../models/featureModels/featureModels.js";
import {
	type ProductItem,
	ProductItemFeatureType,
	UsageModel,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { itemToUsageType } from "./convertItemUtils.js";

export const isContUseItem = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const feature = features.find((f) => f.id === item.feature_id);
	if (!feature) return false;

	return feature.config?.usage_type === ProductItemFeatureType.ContinuousUse;
};

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
