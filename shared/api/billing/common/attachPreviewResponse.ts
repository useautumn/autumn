import { z } from "zod/v4";
import {
	BillingPreviewResponseSchema,
	PreviewTaxSchema,
} from "./billingPreviewResponse.js";

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

	tax: PreviewTaxSchema.optional().meta({
		description:
			"Tax preview for the immediate charge, computed via Stripe Tax. Present only when the org has `automatic_tax` enabled, the customer exists in Stripe, there's a positive amount to charge immediately, and the flow is NOT a Stripe Checkout redirect (Stripe Checkout collects the address and computes tax during the buyer-facing form).",
	}),
	// redirect_type: z.enum(["stripe_checkout", "autumn_checkout", "none"]),
});

export const ExtAttachPreviewResponseSchema = AttachPreviewResponseSchema;
export type ExtAttachPreviewResponse = z.infer<
	typeof ExtAttachPreviewResponseSchema
>;
export type AttachPreviewResponse = z.infer<typeof AttachPreviewResponseSchema>;
