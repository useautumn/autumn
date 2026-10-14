import { z } from "zod/v4";

export const AttachFunctionResponseSchema = z.object({
	checkout_url: z.string().nullish(),
	message: z.string().optional(),
	code: z.string().optional(),

	invoice: z.any().optional(),
	checkoutSession: z.any().optional(),
	stripeSub: z.any().optional(),
	anchorToUnix: z.number().optional(),

	newCustomerProductId: z.string().optional(),
});

export type AttachFunctionResponse = z.infer<
	typeof AttachFunctionResponseSchema
>;
