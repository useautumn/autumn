import { z } from "zod";
import { BillingType, PriceType } from "../../productModels/priceModels.js";
import { FixedPriceConfigSchema } from "../../productModels/fixedPriceModels.js";
import { UsagePriceConfigSchema } from "../../productModels/usagePriceModels.js";

export const CustomerPriceSchema = z.object({
  id: z.string(),
  internal_customer_id: z.string(),
  customer_product_id: z.string(),
  created_at: z.number(),

  price_id: z.string().nullable(),

  options: z.any(),
});

export const CustomPriceSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  created_at: z.number(),

  type: z.nativeEnum(PriceType),
  billing_type: z.nativeEnum(BillingType),
  config: FixedPriceConfigSchema.or(UsagePriceConfigSchema),
});

export type CustomPrice = z.infer<typeof CustomPriceSchema>;
export type CustomerPrice = z.infer<typeof CustomerPriceSchema>;
