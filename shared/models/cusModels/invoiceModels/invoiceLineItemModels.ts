import { z } from "zod/v4";

export const InvoiceLineItemDiscountSchema = z.object({
	amount_off: z.number(),
	percent_off: z.number().optional(),
	stripe_discount_id: z.string().optional(),
	stripe_coupon_id: z.string().optional(),
});

export const InvoiceLineItemEntitySchema = z.object({
	entity_id: z.string(),
	quantity: z.number().nullable(),
	amount: z.number(),
});

export const InvoiceLineItemSchema = z.object({
	id: z.string(),
	created_at: z.number(),
	invoice_id: z.string().nullable(),

	stripe_id: z.string().nullable(),
	stripe_invoice_id: z.string().nullable(),
	stripe_invoice_item_id: z.string().nullable(),
	stripe_subscription_item_id: z.string().nullable(),
	stripe_product_id: z.string().nullable(),
	stripe_price_id: z.string().nullable(),
	stripe_discountable: z.boolean(),

	amount: z.number(),
	amount_after_discounts: z.number(),
	currency: z.string(),

	stripe_quantity: z.number().nullable(),
	total_quantity: z.number().nullable(),
	paid_quantity: z.number().nullable(),

	description: z.string(),
	description_source: z.enum(["stripe", "autumn"]).nullable(),
	direction: z.enum(["charge", "refund"]),
	billing_timing: z.enum(["in_advance", "in_arrear"]).nullable(),
	prorated: z.boolean(),

	price_id: z.string().nullable(),
	customer_product_ids: z.array(z.string()),
	customer_price_ids: z.array(z.string()),
	customer_entitlement_ids: z.array(z.string()),
	internal_product_id: z.string().nullable(),
	product_id: z.string().nullable(),
	internal_feature_id: z.string().nullable(),
	feature_id: z.string().nullable(),

	effective_period_start: z.number().nullable(),
	effective_period_end: z.number().nullable(),

	discounts: z.array(InvoiceLineItemDiscountSchema),

	entities: z.array(InvoiceLineItemEntitySchema),
});

export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;
export type InvoiceLineItemEntity = z.infer<typeof InvoiceLineItemEntitySchema>;
export type InvoiceLineItemDiscount = z.infer<
	typeof InvoiceLineItemDiscountSchema
>;
