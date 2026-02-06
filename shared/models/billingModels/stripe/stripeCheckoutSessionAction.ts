import type Stripe from "stripe";
import { z } from "zod/v4";

export const StripeCheckoutSessionActionSchema = z.object({
	type: z.literal("create"),
	params: z.custom<Stripe.Checkout.SessionCreateParams>(),
});

export type StripeCheckoutSessionAction = z.infer<
	typeof StripeCheckoutSessionActionSchema
>;
