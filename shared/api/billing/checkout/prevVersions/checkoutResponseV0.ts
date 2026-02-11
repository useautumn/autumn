import { ApiProductItemV0Schema } from "@api/products/items/previousVersions/apiProductItemV0.js";
import { ApiProductSchema } from "@api/products/previousVersions/apiProduct.js";
import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels.js";
import { z } from "zod/v4";

// RESULT
export const CheckoutLineV0Schema = z.object({
	description: z.string(),
	amount: z.number(),
	item: ApiProductItemV0Schema.nullish(),
});

export const CheckoutResponseV0Schema = z.object({
	url: z.string().nullish(),
	customer_id: z.string(),
	lines: z.array(CheckoutLineV0Schema),

	product: ApiProductSchema.nullish(),
	current_product: ApiProductSchema.nullish(),

	options: z.array(FeatureOptionsSchema).nullish(),
	total: z.number().nullish(),
	currency: z.string().nullish(),
	has_prorations: z.boolean().nullish(),
	next_cycle: z
		.object({
			starts_at: z.number(),
			total: z.number(),
		})
		.nullish(),
});

export type CheckoutLineV0 = z.infer<typeof CheckoutLineV0Schema>;
export type CheckoutResponseV0 = z.infer<typeof CheckoutResponseV0Schema>;
