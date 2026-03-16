import type Stripe from "stripe";
import { z } from "zod/v4";

export const StripeCheckoutSessionActionSchema = z.object({
	type: z.literal("create"),
	params: z.custom<Stripe.Checkout.SessionCreateParams>(),
	checkoutSessionParams: z
		.custom<Partial<Stripe.Checkout.SessionCreateParams>>()
		.optional(),
});

export type StripeCheckoutSessionAction = z.infer<
	typeof StripeCheckoutSessionActionSchema
>;
