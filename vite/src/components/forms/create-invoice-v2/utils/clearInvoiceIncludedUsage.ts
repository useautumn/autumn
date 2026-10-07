import { isFeaturePriceItem, type ProductItem } from "@autumn/shared";

/** An invoice bills quantities exclusive of grants, so priced items carry no included usage. */
export function clearInvoiceIncludedUsage({
	items,
}: {
	items: ProductItem[];
}): ProductItem[] {
	return items.map((item) =>
		isFeaturePriceItem(item) ? { ...item, included_usage: 0 } : item,
	);
}
