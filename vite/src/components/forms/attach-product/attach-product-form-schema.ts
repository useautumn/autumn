import { z } from "zod/v4";

export const AttachProductFormSchema = z.object({
	customerId: z.string(),
	productId: z.string(),
	prepaidOptions: z.record(z.string(), z.number()),
});

export type AttachProductForm = z.infer<typeof AttachProductFormSchema>;
