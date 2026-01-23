import { z } from "zod/v4";
import { FeatureOptionsSchema } from "../../../models/cusProductModels/cusProductModels.js";
import { ProductItemSchema } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { BillingParamsBaseSchema } from "../common/billingParamsBase.js";

export const RedirectModeSchema = z.enum(["always", "if_required"]);
export type RedirectMode = z.infer<typeof RedirectModeSchema>;

export const ExtAttachV0ParamsSchema = BillingParamsBaseSchema.extend({
	// Product identification
	product_id: z.string(),

	// Invoice mode
	invoice: z.boolean().optional(),
	enable_product_immediately: z.boolean().optional(),
	finalize_invoice: z.boolean().optional(),

	// Product config
	options: z.array(FeatureOptionsSchema).nullish(),
	version: z.number().optional(),

	// Checkout behavior
	redirect_mode: RedirectModeSchema.optional(),
	success_url: z.string().optional(),
});

export const AttachV0ParamsSchema = ExtAttachV0ParamsSchema.extend({
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

export type ExtAttachV0Params = z.infer<typeof ExtAttachV0ParamsSchema>;
export type AttachV0Params = z.infer<typeof AttachV0ParamsSchema>;
