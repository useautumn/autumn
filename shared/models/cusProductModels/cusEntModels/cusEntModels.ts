import { z } from "zod/v4";
import { EntitlementWithFeatureSchema } from "../../productModels/entModels/entModels.js";
import { ReplaceableSchema } from "./replaceableSchema.js";
import { RolloverSchema } from "./rolloverModels/rolloverTable.js";

export const SortCusEntParamsSchema = z.object({
	cusEntId: z.string().optional(),
});

export const EntityBalanceSchema = z.object({
	id: z.string(),
	balance: z.number(),
	adjustment: z.number(),

	additional_balance: z.number().optional(),
});

export const CustomerEntitlementSchema = z.object({
	// Foreign keys
	id: z.string(),
	internal_customer_id: z.string(),
	internal_feature_id: z.string(),
	customer_id: z.string().nullish(), // for debugging purposes
	feature_id: z.string(), // for debugging purposes

	customer_product_id: z.string(),
	entitlement_id: z.string().nullable(),
	created_at: z.number(),

	// Balance fields
	unlimited: z.boolean().nullish(),
	balance: z.number().nullish().default(0),

	additional_balance: z.number().default(0),

	usage_allowed: z.boolean().nullable(),
	next_reset_at: z.number().nullable(),
	adjustment: z.number().nullish().default(0),

	// Group by fields
	entities: z.record(z.string(), EntityBalanceSchema).nullish(),
});

export const FullCustomerEntitlementSchema = CustomerEntitlementSchema.extend({
	entitlement: EntitlementWithFeatureSchema,
	replaceables: z.array(ReplaceableSchema),
	rollovers: z.array(RolloverSchema),
});

export type SortCusEntParams = z.infer<typeof SortCusEntParamsSchema>;
export type EntityBalance = z.infer<typeof EntityBalanceSchema>;
export type CustomerEntitlement = z.infer<typeof CustomerEntitlementSchema>;
export type FullCustomerEntitlement = z.infer<
	typeof FullCustomerEntitlementSchema
>;
