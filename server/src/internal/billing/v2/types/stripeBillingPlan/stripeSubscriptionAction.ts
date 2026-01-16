import { z } from "zod/v4";

export const StripeSubscriptionActionSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("create"),
		params: z.custom<import("stripe").Stripe.SubscriptionCreateParams>(),
	}),
	z.object({
		type: z.literal("update"),
		stripeSubscriptionId: z.string(),
		params: z.custom<import("stripe").Stripe.SubscriptionUpdateParams>(),
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
