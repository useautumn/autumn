import { z } from "zod/v4";

export const StripeReplacedSubscriptionActionSchema = z.object({
	type: z.literal("cancel"),
	stripeSubscriptionId: z.string(),
	stripeSubscriptionScheduleId: z.string().optional(),
	reason: z.enum(["backdate"]).optional(),
});

export type StripeReplacedSubscriptionAction = z.infer<
	typeof StripeReplacedSubscriptionActionSchema
>;
