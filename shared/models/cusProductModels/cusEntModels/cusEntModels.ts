import { z } from "zod/v4";
import type {
	DbPooledBalance,
	DbPooledBalanceContribution,
} from "../../pooledBalanceModels/pooledBalanceTable.js";
import { EntitlementWithFeatureSchema } from "../../productModels/entModels/entModels.js";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";
import { ReplaceableSchema } from "./replaceableSchema.js";
import { RolloverSchema } from "./rolloverModels/rolloverTable.js";

export const CustomerEntitlementFiltersSchema = z.object({
	cusEntIds: z.array(z.string()).optional(),
	interval: z.enum(EntInterval).optional(),
	balanceId: z.string().optional(),
});

export const EntityBalanceSchema = z.object({
	id: z.string(),
	balance: z
		.number()
		.nullable()
		.transform((balance) => balance ?? 0),
	adjustment: z.number(),

	additional_balance: z.number().optional(),
});

export const UsageAttributionItemSchema = z.object({
	units: z.number(),
	credits: z.number(),
});

export const UsageAttributionSchema = z.record(
	z.string(),
	UsageAttributionItemSchema,
);

export const CustomerEntitlementSourceSchema = z.enum([
	"attach",
	"manual_topup",
	"auto_topup",
]);
export type CustomerEntitlementSource = z.infer<
	typeof CustomerEntitlementSourceSchema
>;

export const CustomerEntitlementMetadataSchema = z.object({
	source: CustomerEntitlementSourceSchema,
	plan_id: z.string().nullish(),
	customer_product_id: z.string().nullish(),
});
export type CustomerEntitlementMetadata = z.infer<
	typeof CustomerEntitlementMetadataSchema
>;

export const CustomerEntitlementSchema = z.object({
	id: z.string(),
	internal_customer_id: z.string(),
	internal_entity_id: z.string().nullable(),
	internal_feature_id: z.string(),
	customer_id: z.string().nullish(),
	feature_id: z.string(),

	customer_product_id: z.string().nullable(),
	entitlement_id: z.string(),
	created_at: z.number(),

	unlimited: z.boolean().nullish(),
	balance: z.number().nullish().default(0),

	additional_balance: z.number().default(0),
	usage_attribution: UsageAttributionSchema.optional(),
	invoice_credit: z.boolean().optional(),

	usage_allowed: z.boolean().nullable(),
	separate_interval: z.boolean().default(false),
	is_pooled_balance: z.boolean().optional(),
	pooled_balance_id: z.string().nullable().optional(),
	pooled_contribution_id: z.string().nullable().optional(),
	reset_by_invoice: z.boolean().nullable().optional(),
	reset_cycle_anchor: z.number().nullable().optional(),
	next_reset_at: z.number().nullable(),
	adjustment: z.number().nullish().default(0),

	expires_at: z.number().nullable(),
	cache_version: z.number().optional().default(0),

	entities: z.record(z.string(), EntityBalanceSchema).nullish(),

	external_id: z.string().nullable(),

	metadata: CustomerEntitlementMetadataSchema.nullish(),
});

export const FullCustomerEntitlementSchema = CustomerEntitlementSchema.extend({
	entitlement: EntitlementWithFeatureSchema,
	replaceables: z.array(ReplaceableSchema),
	rollovers: z.array(RolloverSchema),
	pooled_balance: z.custom<DbPooledBalance>().optional(),
	pooled_balance_contribution: z
		.custom<DbPooledBalanceContribution>()
		.optional(),
});

export type CustomerEntitlementFilters = z.infer<
	typeof CustomerEntitlementFiltersSchema
>;
export type EntityBalance = z.infer<typeof EntityBalanceSchema>;
export type UsageAttribution = z.infer<typeof UsageAttributionSchema>;
export type CustomerEntitlement = z.infer<typeof CustomerEntitlementSchema>;
export type FullCustomerEntitlement = z.infer<
	typeof FullCustomerEntitlementSchema
>;
