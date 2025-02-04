import { z } from "zod";

export enum InvoiceStatus {
  Draft = "draft",
  Open = "open",
  Void = "void",
  Paid = "paid",
  Uncollectible = "uncollectible",
}

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
});

export type Invoice = z.infer<typeof InvoiceSchema>;
