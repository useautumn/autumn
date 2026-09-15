import {
	type Feature,
	FeatureType,
	isFeaturePriceItem,
	isFlatRateItem,
	type ProductItem,
	UsageModel,
} from "@autumn/shared";

export const isInvoiceCreditItem = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature?: Feature | null;
}): boolean => {
	if (feature?.type !== FeatureType.CreditSystem) return false;
	if (item.pooled) return false;
	if (!isFeaturePriceItem(item)) return false;
	if (item.usage_model !== UsageModel.PayPerUse) return false;
	return isFlatRateItem({ item });
};
