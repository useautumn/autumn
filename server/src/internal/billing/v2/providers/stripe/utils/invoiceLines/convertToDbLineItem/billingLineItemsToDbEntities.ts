import {
	type InvoiceLineItemEntity,
	isFixedPrice,
	type LineItem,
	roundToCurrencyPrecision,
} from "@autumn/shared";

export const billingLineItemsToDbEntities = ({
	billingLineItems,
}: {
	billingLineItems: LineItem[];
}): InvoiceLineItemEntity[] =>
	billingLineItems.flatMap((lineItem) => {
		const entity = lineItem.context.entity;
		if (!entity) return [];

		const quantity = isFixedPrice(lineItem.context.price)
			? null
			: (lineItem.paidQuantity ?? null);

		return [
			{
				entity_id: entity.id ?? entity.internal_id,
				quantity,
				// Stripe rounds the charged line; keep entity shares at the same precision
				amount: roundToCurrencyPrecision(
					lineItem.amount,
					lineItem.context.currency,
				),
			},
		];
	});
