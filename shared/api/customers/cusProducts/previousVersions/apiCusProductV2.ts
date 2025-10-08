import { ApiProductItemSchema } from "@api/products/apiProductItem.js";
import { z } from "zod/v4";

/**
 * ApiCusProductV2Schema - Customer Product schema for API V1.1+ (post V0_2)
 *
 * Added in V0_2:
 * - items: Array of product items (features, prices)
 * - current_period_start: Billing period start timestamp
 * - current_period_end: Billing period end timestamp
 */
export const ApiCusProductV2Schema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	group: z.string().nullable(),
	status: z.enum(["active", "expired", "scheduled", "trialing", "past_due"]),

	canceled_at: z.number().nullish(),
	started_at: z.number(),
	is_default: z.boolean(),
	is_add_on: z.boolean(),
	version: z.number().nullish(),

	current_period_start: z.number().nullish(),
	current_period_end: z.number().nullish(),

	entity_id: z.string().nullish(),

	items: z.array(ApiProductItemSchema).nullish(),

	quantity: z.number().optional(),
});

export type ApiCusProductV2 = z.infer<typeof ApiCusProductV2Schema>;
