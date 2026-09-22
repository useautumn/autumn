import type {
	ApiInvoiceItem,
	DbInvoiceLineItem,
	Feature,
} from "@autumn/shared";

export const MAX_INLINE_INVOICE_ITEMS = 100;

export const dbLineItemsToApiInvoiceItems = ({
	lineItems,
	features,
}: {
	lineItems: DbInvoiceLineItem[];
	features: Feature[];
}): ApiInvoiceItem[] =>
	lineItems.slice(0, MAX_INLINE_INVOICE_ITEMS).map((lineItem) => {
		const feature = features.find(
			(f) => f.internal_id === lineItem.internal_feature_id,
		);

		return {
			id: lineItem.id,
			description: lineItem.description,
			period_start: lineItem.effective_period_start,
			period_end: lineItem.effective_period_end,
			plan_id: lineItem.product_id,
			feature_id: feature?.id ?? lineItem.feature_id,
			feature_name: feature?.name ?? null,
			// Fixed lines store a multiplier of 1 as paid_quantity; only feature lines carry a real quantity
			quantity: lineItem.feature_id ? lineItem.paid_quantity : null,
			amount: lineItem.amount,
			entities: lineItem.entities,
		};
	});
