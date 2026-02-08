import { z } from "zod/v4";

export const AttachFunctionResponseSchema = z.object({
	checkout_url: z.string().nullish(),
	message: z.string().optional(),
	code: z.string().optional(),

	invoice: z.any().optional(), // Stripe.invoice
	checkoutSession: z.any().optional(), // Stripe.checkout.session
	stripeSub: z.any().optional(), // Stripe.subscription
	anchorToUnix: z.number().optional(),

	newCustomerProductId: z.string().optional(),
});

export type AttachFunctionResponse = z.infer<
	typeof AttachFunctionResponseSchema
>;
