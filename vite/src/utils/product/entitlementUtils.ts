import {
	type Feature,
	FeatureType,
	isFeatureItem,
	isFeaturePriceItem,
	type ProductItem,
} from "@autumn/shared";
import { toast } from "sonner";

export const getFeature = (
	featureId: string | undefined,
	features: Feature[],
) => {
	const foundFeature = features?.find(
		(feature: Feature) => feature.id === featureId,
	);
	return foundFeature || null;
};

export const getFeatureUsageType = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	if (!item.feature_id) return null;
	const feature = getFeature(item.feature_id, features);

	return feature?.config?.usage_type;
};

export const getFeatureCreditSystem = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	if (!item.feature_id) return null;
	const feature = getFeature(item.feature_id, features);

	return feature?.type === FeatureType.CreditSystem;
};

export const checkItemIsValid = (item: ProductItem) => {
	if (item && isFeatureItem(item) && !item.included_usage) {
		toast.error(
			`Balance of ${item.feature_id} to grant must be greater than 0`,
		);
		return false;
	}

	if (
		item &&
		isFeaturePriceItem(item) &&
		!item.price &&
		item.tiers?.every?.((tier) => tier.amount === 0)
	) {
		toast.error(
			`Price of paid feature ${item.feature_id} must be greater than 0`,
		);
		return false;
	}

	return true;
};
