import { APIProductSchema } from "@api/products/apiProduct.js";
import { APIProductItemSchema } from "@api/products/apiProductItem.js";

import { z } from "zod/v4";
import { FeatureOptionsSchema } from "../cusProductModels/cusProductModels.js";

export const CheckoutLineSchema = z.object({
	description: z.string(),
	amount: z.number(),
	item: APIProductItemSchema.nullish(),
});

export const CheckoutResponseSchema = z.object({
	url: z.string().nullish(),
	customer_id: z.string(),
	lines: z.array(CheckoutLineSchema),
	product: APIProductSchema.nullish(),
	current_product: APIProductSchema.nullish(),
	options: z.array(FeatureOptionsSchema).nullish(),
	total: z.number().nullish(),
	currency: z.string().nullish(),
	has_prorations: z.boolean().nullish(),
	// next_cycle_at: z.number().nullish(),
	next_cycle: z
		.object({
			starts_at: z.number().nullish(),
			total: z.number().nullish(),
		})
		.nullish(),
});

export type CheckoutLine = z.infer<typeof CheckoutLineSchema>;
