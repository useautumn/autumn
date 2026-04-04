import { z } from "zod/v4";
import { EntitlementWithFeatureSchema } from "../../productModels/entModels/entModels.js";
import { EntityBalanceSchema } from "./cusEntModels.js";

export const AggregatedCustomerEntitlementSchema = z.object({
	internal_feature_id: z.string(),
	internal_customer_id: z.string(),
	feature_id: z.string(),
	balance: z.number(),
	adjustment: z.number(),
	additional_balance: z.number(),
	unlimited: z.boolean(),
	usage_allowed: z.boolean(),
	entity_count: z.number(),
	entities: z.record(z.string(), EntityBalanceSchema).nullish(),
});

export const FullAggregatedCustomerEntitlementSchema =
	AggregatedCustomerEntitlementSchema.extend({
		entitlement: EntitlementWithFeatureSchema,
	});

export type AggregatedCustomerEntitlement = z.infer<
	typeof AggregatedCustomerEntitlementSchema
>;

export type FullAggregatedCustomerEntitlement = z.infer<
	typeof FullAggregatedCustomerEntitlementSchema
>;
