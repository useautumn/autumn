import { ProductItemSchema } from "./productItemModels.js";
import { z } from "zod";

export const PriceItemSchema = ProductItemSchema.pick({
  price: true,
  interval: true,
  interval_count: true,
}).extend({
  price: z.number().nonnegative(),
});

export type PriceItem = z.infer<typeof PriceItemSchema>;
