import type { Feature } from "../../../models/featureModels/featureModels.js";
import {
	type ProductItem,
	ProductItemFeatureType,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";

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
