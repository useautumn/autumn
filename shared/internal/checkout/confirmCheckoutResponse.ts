import { z } from "zod/v4";
import { BillingResponseSchema } from "../../api/billing/common/billingResponse";

export const ConfirmCheckoutResponseSchema = BillingResponseSchema.extend({
	success: z.boolean(),
	checkout_id: z.string(),
	product_id: z.string(),
	invoice_id: z.string().nullable(),
	success_url: z.string().url(),
});

export type ConfirmCheckoutResponse = z.infer<
	typeof ConfirmCheckoutResponseSchema
>;
