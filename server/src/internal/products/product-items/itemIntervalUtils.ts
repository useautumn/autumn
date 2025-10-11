import {
	BillingInterval,
	EntInterval,
	type ProductItem,
	ProductItemFeatureType,
	type ProductItemInterval,
} from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";

export const billingToItemInterval = (billingInterval: BillingInterval) => {
	if (billingInterval == BillingInterval.OneOff) {
		return null;
	}

	return billingInterval as unknown as ProductItemInterval;
};

export const entToItemInterval = (entInterval?: EntInterval) => {
	if (nullish(entInterval)) {
		return null;
	}

	if (entInterval == EntInterval.Lifetime) {
		return null;
	}

	return entInterval as unknown as ProductItemInterval;
};

export const itemToBillingInterval = (item: ProductItem) => {
	if (nullish(item.interval)) {
		return BillingInterval.OneOff;
	}

	return item.interval;
};

export const itemToEntInterval = (item: ProductItem) => {
	if (nullish(item.interval)) {
		return EntInterval.Lifetime;
	}

	if (item.feature_type == ProductItemFeatureType.ContinuousUse) {
		return EntInterval.Lifetime;
	}

	return item.interval;
};
