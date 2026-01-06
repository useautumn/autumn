import { z } from "zod/v4";

export const StripeInvoiceActionSchema = z.object({
	addLineParams: z.custom<import("stripe").Stripe.InvoiceAddLinesParams>(),
});

export type StripeInvoiceAction = z.infer<typeof StripeInvoiceActionSchema>;
