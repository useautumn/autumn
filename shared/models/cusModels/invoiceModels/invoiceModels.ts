import { z } from "zod";

export const InvoiceSchema = z.object({
  id: z.string(),
  created_at: z.number(),
  internal_customer_id: z.string(),
  product_ids: z.array(z.string()),

  processor: z.object({
    id: z.string(),
    type: z.string(),
    hosted_invoice_url: z.string().nullable(),
  }),
});

export type Invoice = z.infer<typeof InvoiceSchema>;
