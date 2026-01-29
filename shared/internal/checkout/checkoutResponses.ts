import { z } from "zod/v4";
import { BillingPreviewResponseSchema } from "../../api/billing/common/billingPreviewResponse.js";

/**
 * GET /checkouts/:checkout_id response
 */
export const GetCheckoutResponseSchema = z.object({
	preview: BillingPreviewResponseSchema,
});

/**
 * POST /checkouts/:checkout_id/confirm response
 */
export const ConfirmCheckoutResponseSchema = z.object({
	success: z.boolean(),
	checkout_id: z.string(),
	customer_id: z.string(),
	product_id: z.string(),
	invoice_id: z.string().nullable(),
});

export type GetCheckoutResponse = z.infer<typeof GetCheckoutResponseSchema>;
export type ConfirmCheckoutResponse = z.infer<
	typeof ConfirmCheckoutResponseSchema
>;
