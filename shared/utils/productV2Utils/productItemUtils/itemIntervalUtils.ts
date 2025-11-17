import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { EntInterval } from "@models/productModels/intervals/entitlementInterval.js";
import type { ProductItemInterval } from "@models/productModels/intervals/productItemInterval.js";
import {
	type ProductItem,
	ProductItemFeatureType,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { nullish } from "../../utils.js";
import { isFeatureItem } from "./getItemType.js";

export const billingToItemInterval = ({
	billingInterval,
}: {
	billingInterval: BillingInterval;
}) => {
	if (billingInterval === BillingInterval.OneOff) {
		return null;
	}

	return billingInterval as unknown as ProductItemInterval;
};

export const entToItemInterval = ({
	entInterval,
}: {
	entInterval: EntInterval | null | undefined;
}) => {
	if (!entInterval || entInterval === EntInterval.Lifetime) {
		return null;
	}
	return entInterval as unknown as ProductItemInterval;
};

export const itemToBillingOrEntInterval = ({ item }: { item: ProductItem }) => {
	if (isFeatureItem(item)) {
		return itemToEntInterval({ item });
	}

	return itemToBillingInterval({ item });
};

export const itemToBillingInterval = ({ item }: { item: ProductItem }) => {
	if (nullish(item.interval)) {
		return BillingInterval.OneOff as unknown as BillingInterval;
	}

	return item.interval as unknown as BillingInterval;
};

export const itemToEntInterval = ({ item }: { item: ProductItem }) => {
	if (nullish(item.interval)) {
		return EntInterval.Lifetime;
	}

	if (item.feature_type === ProductItemFeatureType.ContinuousUse) {
		return EntInterval.Lifetime;
	}

	return item.interval as unknown as EntInterval;
};
