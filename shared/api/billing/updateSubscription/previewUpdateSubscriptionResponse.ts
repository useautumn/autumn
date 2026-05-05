import { z } from "zod/v4";
import {
	BillingPreviewResponseSchema,
	ExtBillingPreviewResponseSchema,
	PreviewInvoiceCreditsSchema,
	PreviewTaxSchema,
} from "../common/billingPreviewResponse";

export enum UpdateSubscriptionPreviewIntent {
	UpdatePlan = "update_plan",
	UpdateQuantity = "update_quantity",
	CancelImmediately = "cancel_immediately",
	CancelEndOfCycle = "cancel_end_of_cycle",
	Uncancel = "uncancel",
	None = "none",
}

export const ExtPreviewUpdateSubscriptionResponseSchema =
	ExtBillingPreviewResponseSchema.extend({
		intent: z.enum(UpdateSubscriptionPreviewIntent),
		tax: PreviewTaxSchema.optional().meta({
			description:
				"Tax preview for the immediate charge. Contact us to enable the tax flag on your organisation. Shows only with flag enabled, a Stripe customer exists and has a location.",
		}),
		invoice_credits: PreviewInvoiceCreditsSchema.optional().meta({
			description: "Stripe customer invoice credits preview.",
		}),
	});

export const PreviewUpdateSubscriptionResponseSchema =
	BillingPreviewResponseSchema.extend({
		object: z.literal("update_subscription_preview").meta({ internal: true }),
		intent: z.enum(UpdateSubscriptionPreviewIntent),
		tax: PreviewTaxSchema.optional(),
		invoice_credits: PreviewInvoiceCreditsSchema.optional(),
	});

export type ExtPreviewUpdateSubscriptionResponse = z.infer<
	typeof ExtPreviewUpdateSubscriptionResponseSchema
>;
export type PreviewUpdateSubscriptionResponse = z.infer<
	typeof PreviewUpdateSubscriptionResponseSchema
>;
