import { z } from "zod/v4";

export const StripeInvoiceItemsActionSchema = z.object({
	createInvoiceItems: z.array(
		z.custom<import("stripe").Stripe.InvoiceItemCreateParams>(),
	),
});

export type StripeInvoiceItemsAction = z.infer<
	typeof StripeInvoiceItemsActionSchema
>;
