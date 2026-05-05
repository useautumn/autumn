import { z } from "zod/v4";

export const RestoreParamsV1Schema = z.object({
	customer_id: z.string().meta({
		description:
			"Autumn customer whose Stripe state should be restored to match Autumn's customer_products.",
	}),
});

export type RestoreParamsV1 = z.infer<typeof RestoreParamsV1Schema>;

export const RestoreSubscriptionResultSchema = z.object({
	stripe_subscription_id: z.string().nullable(),
	stripe_schedule_id: z.string().nullable(),
	sub_action: z.enum(["update", "noop"]),
	schedule_action: z.enum(["update", "create", "noop"]),
});

export type RestoreSubscriptionResult = z.infer<
	typeof RestoreSubscriptionResultSchema
>;

export const RestoreResponseSchema = z.object({
	customer_id: z.string(),
	restored: z.array(RestoreSubscriptionResultSchema),
});

export type RestoreResponse = z.infer<typeof RestoreResponseSchema>;
