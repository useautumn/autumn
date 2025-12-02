import {
	type Feature,
	FeatureType,
	isBooleanFeatureItem,
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

export const checkItemIsValid = (item: ProductItem, showToast = true) => {
	if (item && isBooleanFeatureItem(item)) return true;

	if (item && isFeatureItem(item) && !item.included_usage) {
		showToast &&
			toast.error(
				`Please finish configuring ${item.feature_id} or remove it from the plan (granted balance is required)`,
			);
		return false;
	}

	if (item && !isFeatureItem(item) && !isFeaturePriceItem(item)) {
		showToast &&
			toast.error(
				`Please finish configuring ${item.feature_id}, or remove it from the plan (price is required)`,
			);
		return false;
	}

	if (
		item &&
		isFeaturePriceItem(item) &&
		!item.price &&
		item.tiers?.every?.((tier) => tier.amount === 0)
	) {
		showToast &&
			toast.error(
				`Please finish configuring ${item.feature_id}, or remove it from the plan (price is required)`,
			);
		return false;
	}

	return true;
};
