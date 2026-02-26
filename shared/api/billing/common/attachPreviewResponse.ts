import { z } from "zod/v4";
import { CheckoutChangeSchema } from "../../../internal/checkout/checkoutResponses.js";
import { CheckoutModeSchema } from "../../../models/billingModels/context/attachBillingContext.js";
import {
	BillingPreviewResponseSchema,
	ExtBillingPreviewResponseSchema,
} from "./billingPreviewResponse.js";

export const ExtAttachPreviewResponseSchema = ExtBillingPreviewResponseSchema;

export const AttachPreviewResponseSchema = BillingPreviewResponseSchema.extend({
	object: z.literal("attach_preview").meta({ internal: true }),
	incoming: z.array(CheckoutChangeSchema),
	outgoing: z.array(CheckoutChangeSchema),
	redirect_type: CheckoutModeSchema,
});

export type ExtAttachPreviewResponse = z.infer<
	typeof ExtAttachPreviewResponseSchema
>;
export type AttachPreviewResponse = z.infer<typeof AttachPreviewResponseSchema>;
