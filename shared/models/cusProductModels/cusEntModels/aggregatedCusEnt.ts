import { z } from "zod/v4";
import { FeatureSchema } from "../../featureModels/featureModels.js";
import { EntityBalanceSchema } from "./cusEntModels.js";

export const AggregatedFeatureBalanceSchema = z.object({
	api_id: z.string(),
	internal_feature_id: z.string(),
	internal_customer_id: z.string(),
	feature_id: z.string(),
	allowance_total: z.number(),
	balance: z.number(),
	adjustment: z.number(),
	additional_balance: z.number(),
	unlimited: z.boolean(),
	usage_allowed: z.boolean(),
	entity_count: z.number(),
	entities: z.record(z.string(), EntityBalanceSchema).nullish(),
});

export const FullAggregatedFeatureBalanceSchema =
	AggregatedFeatureBalanceSchema.extend({
		feature: FeatureSchema,
	});

export type AggregatedFeatureBalance = z.infer<
	typeof AggregatedFeatureBalanceSchema
>;

export type FullAggregatedFeatureBalance = z.infer<
	typeof FullAggregatedFeatureBalanceSchema
>;
