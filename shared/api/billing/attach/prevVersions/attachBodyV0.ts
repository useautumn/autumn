import { z } from "zod/v4";
import { FeatureOptionsSchema } from "../../../../models/cusProductModels/cusProductModels.js";
import { CreateFreeTrialSchema } from "../../../../models/productModels/freeTrialModels/freeTrialModels.js";
import { ProductItemSchema } from "../../../../models/productV2Models/productItemModels/productItemModels.js";
import { notNullish } from "../../../../utils/utils.js";
import { CustomerDataSchema } from "../../../common/customerData.js";
import { EntityDataSchema } from "../../../common/entityData.js";

export const ProductOptionsSchema = z.object({
	product_id: z.string(),
	quantity: z.number().nullish(),
	entity_id: z.string().nullish(),
	options: z.array(FeatureOptionsSchema).nullish(),
});

export const ExtAttachBodyV0Schema = z
	.object({
		// Customer / Entity Info
		customer_id: z.string(),
		product_id: z.string().nullish(),
		entity_id: z.string().nullish(),

		customer_data: CustomerDataSchema.optional(),
		entity_data: EntityDataSchema.optional(),

		product_ids: z.array(z.string()).min(1).nullish(),

		options: z.array(FeatureOptionsSchema).nullish(),

		free_trial: z.boolean().optional(),

		// Others
		success_url: z.string().optional(),
		force_checkout: z.boolean().optional(),
		checkout_session_params: z.any().optional(),
		reward: z.string().or(z.array(z.string())).optional(),
		invoice: z.boolean().optional(),

		// Checkout params
		setup_payment: z.boolean().optional(),
		new_billing_subscription: z.boolean().optional(),
	})
	.meta({
		example: {
			customer_id: "cus_123",
			product_id: "pro",
		},
	});

export const AttachBodyV0Schema = ExtAttachBodyV0Schema.extend({
	// products: z.array(ProductOptions).nullish(),
	customer_data: CustomerDataSchema.nullish(), // For safety

	// Custom Product
	is_custom: z.boolean().optional(),
	items: z.array(ProductItemSchema).optional(),

	// Override free_trial to support CreateFreeTrialSchema
	free_trial: CreateFreeTrialSchema.or(z.boolean()).optional(),

	// New Version
	version: z.number().optional(),

	// Others
	invoice_only: z.boolean().optional(),
	metadata: z.any().optional(),
	billing_cycle_anchor: z.number().optional(),
	enable_product_immediately: z.boolean().optional(),
	finalize_invoice: z.boolean().optional(),
})
	.refine(
		(data) => {
			if (!data.product_id && !data.product_ids) {
				return false;
			}

			return true;
		},
		{
			message: "`product_id` is not provided",
		},
	)
	.refine(
		(data) => {
			if (data.product_id && data.product_ids) {
				return false;
			}

			return true;
		},
		{
			message: "provide either one `product_id` or `product_ids`",
		},
	)
	.refine(
		(data) => {
			if (
				notNullish(data.product_ids) &&
				new Set(data.product_ids).size !== data.product_ids.length
			) {
				return false;
			}

			return true;
		},
		{
			message: "Can't pass in duplicate product_ids",
		},
	)
	.refine(
		(data) => {
			if (data.product_ids && data.is_custom) {
				return false;
			}

			return true;
		},
		{
			message: "Can't pass in product_ids if is_custom is true",
		},
	)
	.refine(
		(data) => {
			if (data.items && !data.is_custom) {
				return false;
			}

			return true;
		},
		{
			message: "Can't pass in items if is_custom is false",
		},
	);

export type AttachBodyV0 = z.infer<typeof AttachBodyV0Schema>;
export type ExtAttachBodyV0 = z.infer<typeof ExtAttachBodyV0Schema>;
export type ProductOptions = z.infer<typeof ProductOptionsSchema>;
