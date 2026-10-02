import { z } from "zod/v4";

export const StripeReplacedSubscriptionActionSchema = z.object({
	type: z.literal("cancel"),
	stripeSubscriptionId: z.string(),
	reason: z.enum(["backdate"]).optional(),
});

export type StripeReplacedSubscriptionAction = z.infer<
	typeof StripeReplacedSubscriptionActionSchema
>;
