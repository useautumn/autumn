import { z } from "zod/v4";
import { ProductItemSchema } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { BillingParamsBaseSchema } from "../common/billingParamsBase.js";

export const RedirectModeSchema = z.enum(["always", "if_required"]);
export type RedirectMode = z.infer<typeof RedirectModeSchema>;

export const ExtAttachParamsV0Schema = BillingParamsBaseSchema.extend({
	// Product identification
	product_id: z.string(),

	// Invoice mode
	invoice: z.boolean().optional(),
	enable_product_immediately: z.boolean().optional(),
	finalize_invoice: z.boolean().optional(),

	// Product config

	// Checkout behavior
	redirect_mode: RedirectModeSchema.default("always"),
	success_url: z.string().optional(),

	new_billing_subscription: z.boolean().optional(),
});

export const AttachParamsV0Schema = ExtAttachParamsV0Schema.extend({
	// Custom product configuration
	items: z.array(ProductItemSchema).optional(),
}).refine(
	(data) => {
		if (data.items && data.items.length === 0) {
			return false;
		}
		return true;
	},
	{
		message: "Must provide at least one item when using custom plan",
	},
);

export type ExtAttachParamsV0 = z.input<typeof ExtAttachParamsV0Schema>;
export type AttachParamsV0 = z.infer<typeof AttachParamsV0Schema>;
export type AttachParamsV0Input = z.input<typeof AttachParamsV0Schema>;
