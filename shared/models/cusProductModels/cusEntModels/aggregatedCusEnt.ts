import { z } from "zod/v4";
import { FeatureSchema } from "../../featureModels/featureModels.js";
import { EntityBalanceSchema } from "./cusEntModels.js";

/** Per-entity slot inside AggregatedFeatureBalance.entities. Extends the
 *  main-balance EntityBalanceSchema with rollover balance/usage so the
 *  customer-level aggregate carries rollovers alongside main balances. */
export const AggregatedEntityBalanceSchema = EntityBalanceSchema.extend({
	rollover_balance: z.number().default(0),
	rollover_usage: z.number().default(0),
});

export const AggregatedFeatureBalanceSchema = z.object({
	api_id: z.string(),
	internal_feature_id: z.string(),
	internal_customer_id: z.string(),
	feature_id: z.string(),
	allowance_total: z.number(),
	prepaid_grant_from_options: z.number().default(0),
	balance: z.number(),
	adjustment: z.number(),
	additional_balance: z.number(),
	rollover_balance: z.number().default(0),
	rollover_usage: z.number().default(0),
	unlimited: z.boolean(),
	usage_allowed: z.boolean(),
	entities: z.record(z.string(), AggregatedEntityBalanceSchema).nullish(),
});

export const FullAggregatedFeatureBalanceSchema =
	AggregatedFeatureBalanceSchema.extend({
		feature: FeatureSchema,
	});

export type AggregatedFeatureBalance = z.infer<
	typeof AggregatedFeatureBalanceSchema
>;

export type AggregatedEntityBalance = z.infer<
	typeof AggregatedEntityBalanceSchema
>;

export type FullAggregatedFeatureBalance = z.infer<
	typeof FullAggregatedFeatureBalanceSchema
>;
