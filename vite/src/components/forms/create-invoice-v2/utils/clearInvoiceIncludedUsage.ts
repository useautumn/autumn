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

/** The items an invoice plan row bills and displays: its edited items, else the catalog plan's, without grants. */
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
