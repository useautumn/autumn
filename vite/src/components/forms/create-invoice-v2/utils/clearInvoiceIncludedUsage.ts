import { isFeaturePriceItem, type ProductItem } from "@autumn/shared";

export function clearInvoiceIncludedUsage({
	items,
}: {
	items: ProductItem[];
}): ProductItem[] {
	return items.map((item) =>
		isFeaturePriceItem(item) ? { ...item, included_usage: 0 } : item,
	);
}

export function invoicePlanItems({
	planItems,
	catalogItems,
}: {
	planItems: ProductItem[] | null;
	catalogItems?: ProductItem[];
}): ProductItem[] | null {
	const items = planItems ?? catalogItems;
	return items ? clearInvoiceIncludedUsage({ items }) : null;
}
