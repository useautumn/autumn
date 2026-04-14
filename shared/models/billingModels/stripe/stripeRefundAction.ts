import { z } from "zod/v4";

export const StripeRefundActionSchema = z.object({
	type: z.literal("refund_last_invoice"),
	stripeSubscriptionId: z.string(),
	mode: z.enum(["prorated", "full"]),
	billingPeriod: z.object({
		start: z.number(),
		end: z.number(),
	}),
});

export type StripeRefundAction = z.infer<typeof StripeRefundActionSchema>;
