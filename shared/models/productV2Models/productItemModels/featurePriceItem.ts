import { z } from "zod/v4";
import { ProductItemSchema } from "./productItemModels.js";

export const FeaturePriceItemSchema = ProductItemSchema.pick({
	feature_id: true,
	feature_type: true,
	included_usage: true,
	interval: true,
	interval_count: true,
	usage_model: true,

	price: true,
	tiers: true,
	tier_behavior: true,
	billing_units: true,

	reset_usage_when_enabled: true,
	usage_limit: true,
	config: true,
	entity_feature_id: true,
}).extend({
	feature_id: z.string().nonempty(),
	included_usage: z.number().nonnegative().nullish(),
});

export type FeaturePriceItem = z.infer<typeof FeaturePriceItemSchema>;
