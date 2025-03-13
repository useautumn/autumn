import { z } from "zod";

export enum InvoiceStatus {
  Draft = "draft",
  Open = "open",
  Void = "void",
  Paid = "paid",
  Uncollectible = "uncollectible",
}

export const InvoiceDiscountSchema = z.object({
  stripe_coupon_id: z.string(), // Stripe ID
  coupon_name: z.string(),
  amount_off: z.number(),
  amount_used: z.number(),
});

export const InvoiceSchema = z.object({
  id: z.string(),
  created_at: z.number(),
  internal_customer_id: z.string(),
  product_ids: z.array(z.string()),
  internal_product_ids: z.array(z.string()),

  // Stripe fields
  stripe_id: z.string(),
  status: z.nativeEnum(InvoiceStatus).nullable().optional(),
  hosted_invoice_url: z.string().nullable(),

  // Total amount of the invoice
  total: z.number(),
  currency: z.string(),
  receipt_url: z.string().nullish(),
  discounts: z.array(InvoiceDiscountSchema),
});

export type Invoice = z.infer<typeof InvoiceSchema>;
export type InvoiceDiscount = z.infer<typeof InvoiceDiscountSchema>;
