import type {
	InsertDbInvoiceLineItem,
	InvoiceLineItemDiscount,
	LineItem,
} from "@autumn/shared";

/**
 * Helper for full match case - converts an Autumn LineItem to InsertInvoiceLineItem.
 */
export const billingLineItemToInsertDbLineItem = ({
	lineItem,
	invoiceId,
	stripeInvoiceId,
	stripeLineItemId,
}: {
	lineItem: LineItem;
	invoiceId: string;
	stripeInvoiceId: string;
	stripeLineItemId?: string;
}): InsertDbInvoiceLineItem => {
	const { context } = lineItem;

	return {
		id: lineItem.id,
		invoice_id: invoiceId,
		stripe_id: stripeLineItemId ?? null,
		stripe_invoice_id: stripeInvoiceId,
		stripe_product_id: lineItem.stripeProductId ?? null,
		stripe_price_id: lineItem.stripePriceId ?? null,
		stripe_discountable: context.discountable ?? true,

		amount: lineItem.amount,
		amount_after_discounts: lineItem.amountAfterDiscounts,
		currency: context.currency,

		total_quantity: lineItem.totalQuantity ?? null,
		paid_quantity: lineItem.paidQuantity ?? null,

		description: lineItem.description,
		direction: context.direction,
		billing_timing: context.billingTiming,
		prorated: lineItem.prorated,

		price_id: context.price.id,
		customer_product_id: context.customerProduct?.id ?? null,
		customer_entitlement_id: context.customerEntitlement?.id ?? null,
		internal_product_id: context.product.internal_id,
		product_id: context.product.id,
		internal_feature_id: context.feature?.internal_id ?? null,
		feature_id: context.feature?.id ?? null,

		effective_period_start: context.effectivePeriod?.start ?? null,
		effective_period_end: context.effectivePeriod?.end ?? null,

		discounts: lineItem.discounts.map(
			(d): InvoiceLineItemDiscount => ({
				amount_off: d.amountOff,
				percent_off: d.percentOff,
				stripe_coupon_id: d.stripeCouponId,
			}),
		),
	};
};
