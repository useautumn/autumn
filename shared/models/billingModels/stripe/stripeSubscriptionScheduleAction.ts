import type Stripe from "stripe";
import { z } from "zod/v4";

export const StripeSubscriptionScheduleActionSchema = z.discriminatedUnion(
	"type",
	[
		z.object({
			type: z.literal("create"),
			params: z.custom<Stripe.SubscriptionScheduleUpdateParams>(),
		}),
		z.object({
			type: z.literal("update"),
			stripeSubscriptionScheduleId: z.string(),
			params: z.custom<Stripe.SubscriptionScheduleUpdateParams>(),
		}),
		z.object({
			type: z.literal("release"),
			stripeSubscriptionScheduleId: z.string(),
		}),
	],
);

export type StripeSubscriptionScheduleAction = z.infer<
	typeof StripeSubscriptionScheduleActionSchema
>;
