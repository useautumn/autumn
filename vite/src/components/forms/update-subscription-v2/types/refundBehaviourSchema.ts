import { z } from "zod/v4";

export const RefundBehaviorSchema = z.enum([
	"grant_invoice_credits",
	"refund_payment_method",
]);
export type RefundBehaviorValue = z.infer<typeof RefundBehaviorSchema>;
