import { z } from "zod";
import { BillingInterval } from "../priceEnums.js";

export const FixedPriceConfigSchema = z.object({
  type: z.string(),
  amount: z.number().min(0),
  interval: z.nativeEnum(BillingInterval),
  stripe_price_id: z.string().nullish(),
});

export type FixedPriceConfig = z.infer<typeof FixedPriceConfigSchema>;
