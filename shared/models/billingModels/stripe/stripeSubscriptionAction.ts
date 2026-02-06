import type Stripe from "stripe";
import { z } from "zod/v4";

export const StripeSubscriptionActionSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("create"),
		params: z.custom<Stripe.SubscriptionCreateParams>(),
	}),
	z.object({
		type: z.literal("update"),
		stripeSubscriptionId: z.string(),
		params: z.custom<Stripe.SubscriptionUpdateParams>(),
	}),
	z.object({
		type: z.literal("cancel_immediately"),
		stripeSubscriptionId: z.string(),
	}),
	z.object({
		type: z.literal("cancel_at_period_end"),
		stripeSubscriptionId: z.string(),
	}),
	z.object({
		type: z.literal("cancel"),
		stripeSubscriptionId: z.string(),
	}),
	z.object({
		type: z.literal("none"),
	}),
]);

export type StripeSubscriptionAction = z.infer<
	typeof StripeSubscriptionActionSchema
>;
