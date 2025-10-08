import { z } from "zod/v4";

export const ApiCusProductV0PriceSchema = z.object({
	amount: z.number(),
	interval: z.string(),
});

export const ApiCusProductV0Schema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	group: z.string().nullable(),
	status: z.enum(["active", "expired", "scheduled", "trialing", "past_due"]),
	created_at: z.number(),
	canceled_at: z.number().nullish(),

	processor: z
		.object({
			type: z.string(),
			subscription_id: z.string().nullish(),
		})
		.nullish(),

	subscription_ids: z.array(z.string()).default([]),
	prices: z.array(z.any()).default([]),

	starts_at: z.number(),
});

export type ApiCusProductV0 = z.infer<typeof ApiCusProductV0Schema>;
