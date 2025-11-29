import { z } from "zod/v4";

export const AttachProductFormSchema = z.object({
	productId: z.string(),
	prepaidOptions: z.record(z.string(), z.number()),
});

// Extended type with initialPrepaidOptions (not validated, just for state tracking)
export type AttachProductForm = z.infer<typeof AttachProductFormSchema> & {
	initialPrepaidOptions?: Record<string, number>;
};
