import { z } from "zod/v4";

export const AttachResultV0Schema = z.object({
	customer_id: z.string(),
	product_ids: z.array(z.string()),
	code: z.string(),
	message: z.string(),

	checkout_url: z.string().nullish(),
	invoice: z.any().nullish(),
});

export type AttachResultV0 = z.infer<typeof AttachResultV0Schema>;
