import { z } from "zod/v4";

export const AttachResponseV0Schema = z.object({
	success: z.boolean().optional(),
	message: z.string().optional(),
	checkout_url: z.string().nullish(),
	invoice: z.any().nullish(),
});

export const AttachResponseV1Schema = z.object({
	success: z.boolean(),
	customer_id: z.string(),
	product_ids: z.array(z.string()),
	code: z.string(),
	message: z.string(),

	checkout_url: z.string().nullish(),
	invoice: z.any().nullish(),
});

export type AttachResponseV0 = z.infer<typeof AttachResponseV0Schema>;
export type AttachResponseV1 = z.infer<typeof AttachResponseV1Schema>;
