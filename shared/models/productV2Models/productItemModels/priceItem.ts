import { ProductItemSchema } from "@autumn/shared";
import { z } from "zod";

export const PriceItemSchema = ProductItemSchema.pick({
  price: true,
  interval: true,
}).extend({
  price: z.number().nonnegative(),
});

export type PriceItem = z.infer<typeof PriceItemSchema>;
