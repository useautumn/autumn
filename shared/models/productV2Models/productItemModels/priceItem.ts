import { z } from "zod/v4";
import { ProductItemSchema } from "./productItemModels.js";

export const PriceItemSchema = ProductItemSchema.pick({
	price: true,
	interval: true,
	interval_count: true,

	price_id: true,
	price_config: true,
}).extend({
	price: z.number().nonnegative(),
});

export type PriceItem = z.infer<typeof PriceItemSchema>;
