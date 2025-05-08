import { z } from "zod";

export const InvoiceResponseSchema = z.object({
  product_ids: z.array(z.string()),
  stripe_id: z.string(),
  status: z.string(),
  total: z.number(),
  currency: z.string(),
  created_at: z.number(),
  // period_start: z.number().nullish(),
  // period_end: z.number().nullish(),
});

export const InvoiceResponseListSchema = z.array(InvoiceResponseSchema);
export type InvoiceResponse = z.infer<typeof InvoiceResponseSchema>;
