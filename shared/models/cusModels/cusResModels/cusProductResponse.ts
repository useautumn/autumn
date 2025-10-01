import { APIProductItemSchema } from "@api/products/apiProductItem.js";
import { z } from "zod/v4";
import { CusProductStatus } from "../../cusProductModels/cusProductEnums.js";

export const CusProductResponseSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	group: z.string().nullable(),
	status: z.nativeEnum(CusProductStatus),
	// created_at: z.number(),
	canceled: z.boolean().nullish(),
	trialing: z.boolean().nullish(),

	canceled_at: z.number().nullish(),
	started_at: z.number(),
	is_default: z.boolean(),
	is_add_on: z.boolean(),
	version: z.number().nullish(),

	stripe_subscription_ids: z.array(z.string()).nullish(),

	current_period_start: z.number().nullish(),
	current_period_end: z.number().nullish(),
	entity_id: z.string().nullish(),
	items: z.array(APIProductItemSchema).nullish(),
	quantity: z.number().optional(),
	prepaid_quantities: z
		.array(
			z.object({
				quantity: z.number(),
				feature_id: z.string(),
			}),
		)
		.nullish(),
});
