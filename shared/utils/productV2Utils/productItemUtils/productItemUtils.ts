import {
	FeatureType,
	FeatureUsageType,
} from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { EntInterval } from "../../../models/productModels/entModels/entEnums.js";
import { BillingInterval } from "../../../models/productModels/priceModels/priceEnums.js";
import {
	type ProductItem,
	ProductItemFeatureType,
	type ProductItemInterval,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { nullish } from "../../utils.js";
import { isFeatureItem, isFeaturePriceItem } from "./getItemType.js";

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
		} else {
			return feature.config?.usage_type;
		}
	}

	return undefined;
};

export const getResetUsage = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature?: Feature;
}) => {
	if (!item.feature_id) {
		return undefined;
	}
	if (
		nullish(item.reset_usage_when_enabled) &&
		(isFeatureItem(item) || isFeaturePriceItem(item)) &&
		feature
	) {
		return feature?.config?.usage_type === FeatureUsageType.Single;
	}
	return item.reset_usage_when_enabled;
};
