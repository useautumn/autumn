import {
	BillingMethod,
	isFeaturePriceItem,
	itemToBillingMethod,
	type ProductItem,
} from "@autumn/shared";

/**
 * One stated id, two slots: prepaid bills from v2, everything else — base
 * prices and usage-based items — from v1. The server routes it the same way.
 */
const mappingSlot = ({ item }: { item: ProductItem }) =>
	isFeaturePriceItem(item) &&
	itemToBillingMethod({ item }) === BillingMethod.Prepaid
		? "stripe_prepaid_price_v2_id"
		: "stripe_price_id";

export const itemStripePriceId = ({
	item,
}: {
	item: ProductItem;
}): string | null =>
	item.price_config?.stripe_prepaid_price_v2_id ??
	item.price_config?.stripe_price_id ??
	null;

export const withItemStripePriceId = ({
	item,
	stripePriceId,
}: {
	item: ProductItem;
	stripePriceId: string | null;
}): ProductItem => ({
	...item,
	price_config: {
		...(item.price_config ?? {}),
		[mappingSlot({ item })]: stripePriceId,
	},
});
