import { type ProductItem, UsageModel } from "@autumn/shared";

export type InvoiceQuantityRow = {
	featureId: string;
	prepaid?: ProductItem;
	usage?: ProductItem;
};

export function invoiceQuantityRows({
	items,
}: {
	items: ProductItem[] | null | undefined;
}): InvoiceQuantityRow[] {
	const rows = new Map<string, InvoiceQuantityRow>();
	for (const item of items ?? []) {
		const featureId = item.feature_id;
		const slot =
			item.usage_model === UsageModel.Prepaid
				? "prepaid"
				: item.usage_model === UsageModel.PayPerUse
					? "usage"
					: null;
		if (!featureId || !slot) continue;
		const row = rows.get(featureId) ?? { featureId };
		if (!row[slot]) row[slot] = item;
		rows.set(featureId, row);
	}
	return [...rows.values()];
}

export const isPricedBothWays = (row: InvoiceQuantityRow | undefined) =>
	Boolean(row?.prepaid && row.usage);
