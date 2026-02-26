import { z } from "zod/v4";

export const InvoiceLineItemDiscountSchema = z.object({
	amount_off: z.number(),
	percent_off: z.number().optional(),
	stripe_coupon_id: z.string().optional(),
});

export const InvoiceLineItemSchema = z.object({
	id: z.string(),
	created_at: z.number(),
	invoice_id: z.string(),

	// Stripe identifiers
	stripe_id: z.string().nullable(),
	stripe_invoice_id: z.string().nullable(),
	stripe_product_id: z.string().nullable(),
	stripe_price_id: z.string().nullable(),
	stripe_discountable: z.boolean(),

	// Amounts
	amount: z.number(),
	amount_after_discounts: z.number(),
	currency: z.string(),

	// Quantities
	total_quantity: z.number().nullable(),
	paid_quantity: z.number().nullable(),

	// Description & metadata
	description: z.string(),
	direction: z.enum(["charge", "refund"]),
	billing_timing: z.enum(["in_advance", "in_arrear"]).nullable(),
	prorated: z.boolean(),

	// Autumn entity relationships
	price_id: z.string().nullable(),
	customer_product_id: z.string().nullable(),
	customer_entitlement_id: z.string().nullable(),
	internal_product_id: z.string().nullable(),
	product_id: z.string().nullable(),
	internal_feature_id: z.string().nullable(),
	feature_id: z.string().nullable(),

	// Billing periods
	effective_period_start: z.number().nullable(),
	effective_period_end: z.number().nullable(),

	// Discounts
	discounts: z.array(InvoiceLineItemDiscountSchema),
});

export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;
export type InvoiceLineItemDiscount = z.infer<
	typeof InvoiceLineItemDiscountSchema
>;
