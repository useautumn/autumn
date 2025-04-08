import { BillingInterval } from "@autumn/shared";
import { z } from "zod";

export const ItemSetSchema = z.object({
  items: z.array(z.any()),
  prices: z.array(z.any()),
  interval: z.nativeEnum(BillingInterval),
  subMeta: z.record(z.string(), z.any()),
  usageFeatures: z.array(z.string()),
});

export type ItemSet = z.infer<typeof ItemSetSchema>;
