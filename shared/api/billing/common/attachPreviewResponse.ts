import { z } from "zod/v4";
import { CheckoutChangeSchema } from "../../../internal/checkout/checkoutResponses.js";
import { CheckoutModeSchema } from "../../../models/billingModels/context/attachBillingContext.js";
import { BillingPreviewResponseSchema } from "./billingPreviewResponse.js";

/**
 * Attach preview response - extends BillingPreviewResponse with incoming/outgoing changes
 */
export const AttachPreviewResponseSchema = BillingPreviewResponseSchema.extend({
	incoming: z.array(CheckoutChangeSchema),
	outgoing: z.array(CheckoutChangeSchema),
	redirect_type: CheckoutModeSchema,
});

export type AttachPreviewResponse = z.infer<typeof AttachPreviewResponseSchema>;
