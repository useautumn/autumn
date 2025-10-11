import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { EntInterval } from "../../../models/productModels/entModels/entEnums.js";
import { BillingInterval } from "../../../models/productModels/priceModels/priceEnums.js";
import {
	type ProductItem,
	ProductItemFeatureType,
	type ProductItemInterval,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";

export const entToItemInterval = (entInterval: EntInterval) => {
	if (entInterval === EntInterval.Lifetime) {
		return null;
	}
	return entInterval as unknown as ProductItemInterval;
};

export const billingToItemInterval = (billingInterval: BillingInterval) => {
	if (billingInterval === BillingInterval.OneOff) {
		return null;
	}

	return billingInterval as unknown as ProductItemInterval;
};

export const getItemFeatureType = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const feature = features.find((f) => f.id === item.feature_id);

	if (feature) {
		if (feature.type === FeatureType.Boolean) {
			return ProductItemFeatureType.Static;
		} else if (feature.type === FeatureType.CreditSystem) {
			return ProductItemFeatureType.SingleUse;
		} else if (feature.usage_type) {
			return feature.usage_type as unknown as ProductItemFeatureType;
		}
	}

	return undefined;
};
