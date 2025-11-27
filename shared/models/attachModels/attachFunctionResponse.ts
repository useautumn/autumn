import { z } from "zod/v4";

export const AttachFunctionResponseSchema = z.object({
	checkout_url: z.string().optional(),
	message: z.string().optional(),
	code: z.string().optional(),

	invoice: z.any().optional(), // Stripe.invoice
	checkoutSession: z.any().optional(), // Stripe.checkout.session
	stripeSub: z.any().optional(), // Stripe.subscription
	anchorToUnix: z.number().optional(),
	// product_ids: z.array(z.string()),
	// customer_id: z.string(),
	// scenario: z.nativeEnum(AttachScenario),
});

export type AttachFunctionResponse = z.infer<
	typeof AttachFunctionResponseSchema
>;
