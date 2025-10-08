import { ApiProductItemSchema } from "@api/products/apiProductItem.js";
import { z } from "zod/v4";

export const ApiCusProductSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	group: z.string().nullable(),
	status: z.enum(["active", "expired", "scheduled", "trialing", "past_due"]),

	canceled_at: z.number().nullish(),
	started_at: z.number(),
	is_default: z.boolean(),
	is_add_on: z.boolean(),
	version: z.number().nullish(),

	stripe_subscription_ids: z.array(z.string()).nullish(),
	current_period_start: z.number().nullish(),
	current_period_end: z.number().nullish(),

	entity_id: z.string().nullish(),

	items: z.array(ApiProductItemSchema).nullish(),

	quantity: z.number().optional(),
});

export type ApiCusProduct = z.infer<typeof ApiCusProductSchema>;
