import { z } from "zod/v4";
import { FeatureOptionsSchema } from "../../../models/cusProductModels/cusProductModels.js";
import { ProductItemSchema } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { CustomerDataSchema } from "../../common/customerData.js";
import { EntityDataSchema } from "../../common/entityData.js";

export const ExtAttachV0ParamsSchema = z.object({
	// Customer / Entity Info
	customer_id: z.string(),
	product_id: z.string(),
	entity_id: z.string().nullish(),

	customer_data: CustomerDataSchema.optional(),
	entity_data: EntityDataSchema.optional(),

	// Invoice mode
	invoice: z.boolean().optional(),
	enable_product_immediately: z.boolean().optional(),
	finalize_invoice: z.boolean().optional(),

	// Product config
	options: z.array(FeatureOptionsSchema).nullish(),
	version: z.number().optional(),
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
