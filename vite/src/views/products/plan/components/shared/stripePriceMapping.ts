import type { ProductItem } from "@autumn/shared";

/**
 * A base price is fixed and bills from the v1 slot; a prepaid feature price
 * bills from v2. The server picks the same slot from the stated `processors`.
 */
const mappingSlot = ({ item }: { item: ProductItem }) =>
	item.feature_id ? "stripe_prepaid_price_v2_id" : "stripe_price_id";

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
