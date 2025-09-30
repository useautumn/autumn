import { APIFeatureSchema } from "@api/features/apiFeature.js";
import { Infinite } from "@models/productModels/productEnums.js";
import {
	PriceTierSchema,
	ProductItemFeatureType,
	ProductItemInterval,
	ProductItemType,
	UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";

export const APIProductItemSchema = z
	.object({
		// Feature stuff
		type: z.enum(ProductItemType).nullish(),
		feature_id: z.string().nullish(),
		feature_type: z.enum(ProductItemFeatureType).nullish(),

		// Feature response
		feature: APIFeatureSchema.nullish(),

		included_usage: z.number().or(z.literal(Infinite)).nullish(),
		interval: z.enum(ProductItemInterval).nullish(),
		interval_count: z.number().nullish(),

		// Price config
		price: z.number().nullish(),
		tiers: z.array(PriceTierSchema).nullish(),
		usage_model: z.enum(UsageModel).nullish(),
		billing_units: z.number().nullish(), // amount per billing unit (eg. $9 / 250 units)
		reset_usage_when_enabled: z.boolean().nullish(),
		quantity: z.number().nullish(),
		next_cycle_quantity: z.number().nullish(),
		entity_feature_id: z.string().nullish(),

		display: z
			.object({
				primary_text: z.string(),
				secondary_text: z.string().nullish(),
			})
			.nullish(),
	})
	.meta({
		id: "ProductItem",
		description: "A product item that defines a feature",
		example: {
			feature_id: "feature_1",
			feature_type: "single_use",
			included_usage: 123,
			interval: "monthly",
			usage_model: "prepaid",
		},
	});

export type APIProductItem = z.infer<typeof APIProductItemSchema>;
