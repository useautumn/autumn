import type Stripe from "stripe";
import { z } from "zod/v4";

export const StripeInvoiceActionSchema = z.object({
	addLineParams: z.custom<Stripe.InvoiceAddLinesParams>(),
});

export type StripeInvoiceAction = z.infer<typeof StripeInvoiceActionSchema>;
