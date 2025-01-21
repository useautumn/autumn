import { z } from "zod";

export enum BillingInterval {
  OneOff = "one_off",
  Month = "month",
  Year = "year",
}

export const FixedPriceConfigSchema = z.object({
  type: z.string(),
  amount: z.number().min(0),
  interval: z.nativeEnum(BillingInterval),
});

export type FixedPriceConfig = z.infer<typeof FixedPriceConfigSchema>;
