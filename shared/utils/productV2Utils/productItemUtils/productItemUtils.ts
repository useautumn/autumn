import {
	FeatureType,
	FeatureUsageType,
} from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import {
	type ProductItem,
	ProductItemFeatureType,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { getProductItemDisplay } from "../../productDisplayUtils.js";
import { nullish } from "../../utils.js";
import {
	getItemType,
	isFeatureItem,
	isFeaturePriceItem,
} from "./getItemType.js";

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

export const formatItem = ({
	item,
	features,
}: {
	item?: ProductItem;
	features: Feature[];
}) => {
	if (!item || features.length === 0) return "N / A";
	const display = getProductItemDisplay({
		item,
		features,
		currency: "usd",
		// fullDisplay: true,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
		},
	});

	const itemType = getItemType(item);

	return `(${itemType}) ${display.primary_text} ${display.secondary_text || ""}`;
};
