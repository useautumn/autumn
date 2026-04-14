import { z } from "zod/v4";

export const RefundLastPaymentSchema = z.enum(["prorated", "full"]).meta({
	title: "RefundLastPayment",
	description:
		"Controls how the last payment is refunded on immediate cancellation. 'prorated' refunds the unused portion, 'full' refunds the entire last payment.",
});

export type RefundLastPayment = z.infer<typeof RefundLastPaymentSchema>;
