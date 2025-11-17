import { ApiProductItemSchema } from "@api/products/planFeature/previousVersions/apiProductItem.js";
import { ApiProductSchema } from "@api/products/previousVersions/apiProduct.js";
import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels.js";
import { z } from "zod/v4";

// RESULT
export const CheckoutLineSchema = z.object({
	description: z.string(),
	amount: z.number(),
	item: ApiProductItemSchema.nullish(),
});

export const CheckoutResponseSchema = z.object({
	url: z.string().nullish(),
	customer_id: z.string(),
	lines: z.array(CheckoutLineSchema),

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

export type CheckoutLine = z.infer<typeof CheckoutLineSchema>;
