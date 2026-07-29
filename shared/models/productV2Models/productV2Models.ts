import { ApiFreeTrialSchema } from "@api/models.js";
import { z } from "zod/v4";
import { CustomerBillingControlsSchema } from "../cusModels/billingControls/customerBillingControls.js";
import { AppEnv } from "../genModels/genEnums.js";
import { ProductConfigSchema } from "../productModels/productConfig/productConfig.js";
import { ProductMetadataSchema } from "../productModels/productMetadata.js";
import { ProductItemSchema } from "./productItemModels/productItemModels.js";

export const ProductV2Schema = z.object({
	internal_id: z.string().nullish(),

	id: z.string(),
	name: z.string(),
	description: z.string().nullish(),
	is_add_on: z.boolean(),
	is_default: z.boolean(),
	version: z.number().default(1),
	group: z.string().nullable(),
	env: z.nativeEnum(AppEnv),

	// free_trial: FreeTrialSchema.nullish(),
	free_trial: ApiFreeTrialSchema.nullish(),
	items: z.array(ProductItemSchema),
	created_at: z.number(),
	stripe_id: z.string().nullish(),
	archived: z.boolean().default(false).nullish(),
	base_internal_product_id: z.string().nullish(),
	base_id: z.string().nullish(),
	config: ProductConfigSchema.partial().optional(),
	billing_controls: CustomerBillingControlsSchema.optional(),
	metadata: ProductMetadataSchema.optional(),
});

// 1. Create a new type called FrontendProduct
export const FrontendProductSchema = ProductV2Schema.extend({
	planType: z.enum(["free", "paid"]).nullable(),
	basePriceType: z
		.enum(["recurring", "one-off", "usage"])
		.default("recurring")
		.nullable(),
	external_processors: z
		.object({
			revenuecat: z
				.object({
					linked_product_id: z.string().nullish(),
				})
				.nullish(),
		})
		.nullish(),
});

export type ProductV2 = z.infer<typeof ProductV2Schema>;
export type FrontendProduct = z.infer<typeof FrontendProductSchema>;
