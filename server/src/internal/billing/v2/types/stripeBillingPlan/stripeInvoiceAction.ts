import { z } from "zod/v4";
import { InvoiceModeSchema } from "../autumnBillingPlan";

export const StripeInvoiceActionSchema = z.object({
	addLineParams: z.custom<import("stripe").Stripe.InvoiceAddLinesParams>(),
	invoiceMode: InvoiceModeSchema.optional(),
});

export type StripeInvoiceAction = z.infer<typeof StripeInvoiceActionSchema>;

