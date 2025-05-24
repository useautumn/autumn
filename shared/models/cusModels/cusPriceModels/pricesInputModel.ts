import { z } from "zod";
import { FixedPriceConfigSchema } from "../../productModels/priceModels/priceConfig/fixedPriceConfig.js";
import { UsagePriceConfigSchema } from "../../productModels/priceModels/priceConfig/usagePriceConfig.js";

export const PriceOptionsSchema = z.object({
  quantity: z.number().optional(), // for usage in-advance
  threshold: z.number().optional(), // for usage below threshold
});

export const PricesInputSchema = z.array(
  z.object({
    id: z.string(),
    options: PriceOptionsSchema,
    config: FixedPriceConfigSchema.or(UsagePriceConfigSchema),
  }),
);

export type PricesInput = z.infer<typeof PricesInputSchema>;
export type PriceOptions = z.infer<typeof PriceOptionsSchema>;
