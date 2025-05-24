import { z } from "zod";
import { PriceSchema } from "../../productModels/priceModels/priceModels.js";

export const CustomerPriceSchema = z.object({
  id: z.string(),
  internal_customer_id: z.string(),
  customer_product_id: z.string(),
  created_at: z.number(),

  price_id: z.string().nullable(),
});

export const FullCustomerPriceSchema = CustomerPriceSchema.extend({
  price: PriceSchema,
});

export type CustomerPrice = z.infer<typeof CustomerPriceSchema>;
export type FullCustomerPrice = z.infer<typeof FullCustomerPriceSchema>;
