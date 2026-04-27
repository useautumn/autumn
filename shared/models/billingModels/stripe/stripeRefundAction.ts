import { z } from "zod/v4";

export const StripeRefundActionSchema = z.object({
	type: z.literal("refund_last_invoice"),
	stripeInvoiceId: z.string(),
	chargeId: z.string(),
	amountInCents: z.number(),
});

export type StripeRefundAction = z.infer<typeof StripeRefundActionSchema>;
