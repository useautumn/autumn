import { z } from "zod/v4";
import {
	BillingPreviewResponseSchema,
	ExtBillingPreviewResponseSchema,
} from "./billingPreviewResponse.js";

export const ExtAttachPreviewResponseSchema = ExtBillingPreviewResponseSchema;

export const AttachPreviewResponseSchema = BillingPreviewResponseSchema.extend({
	object: z.literal("attach_preview").meta({ internal: true }),
	redirect_to_checkout: z.boolean().meta({
		description:
			"Whether the customer will be redirected to a checkout page if attach is called.",
	}),

	checkout_type: z
		.enum(["stripe_checkout", "autumn_checkout"])
		.nullable()
		.meta({
			description:
				"The type of checkout that will be used if the customer is redirected to a checkout page.",
		}),
	// redirect_type: z.enum(["stripe_checkout", "autumn_checkout", "none"]),
});

export type ExtAttachPreviewResponse = z.infer<
	typeof ExtAttachPreviewResponseSchema
>;
export type AttachPreviewResponse = z.infer<typeof AttachPreviewResponseSchema>;
