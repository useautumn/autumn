import {
	Infinite,
	isFeaturePriceItem,
	type ProductItem,
	UsageModel,
} from "@autumn/shared";

/** Threshold billing needs a finite pay-per-use price, the same rule the API enforces. */
export const showsThresholdBilling = ({ item }: { item: ProductItem }) => {
	// Each threshold charge restarts the tier count, so tiered prices would be mis-priced.
	const hasMultipleTiers = (item.tiers?.length ?? 0) > 1;

	return (
		isFeaturePriceItem(item) &&
		item.usage_model === UsageModel.PayPerUse &&
		item.included_usage !== Infinite &&
		!hasMultipleTiers
	);
};

export const itemThreshold = ({ item }: { item: ProductItem }) =>
	item.config?.threshold_billing?.threshold ?? null;

/** An ineligible item must not keep a stale threshold: the API rejects it on save. */
export const reconcileThresholdBilling = ({
	item,
}: {
	item: ProductItem;
}): ProductItem =>
	showsThresholdBilling({ item }) || itemThreshold({ item }) === null
		? item
		: withThresholdBilling({ item, threshold: null });

export const withThresholdBilling = ({
	item,
	threshold,
}: {
	item: ProductItem;
	threshold: number | null;
}): ProductItem => {
	const config = { ...(item.config ?? {}) };
	if (threshold === null) {
		delete config.threshold_billing;
	} else {
		config.threshold_billing = { threshold };
	}
	return { ...item, config };
};
