import { z } from "zod/v4";
import { UsageLimitAnchorSchema } from "../../cusModels/billingControls/usageLimit.js";
import type { Feature } from "../../featureModels/featureModels.js";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";

export const UsageWindowDimensionSchema = z.enum([
	"balance",
	"metered_feature",
]);
export type UsageWindowDimension = z.infer<typeof UsageWindowDimensionSchema>;

export const UsageWindowScopeSchema = z.enum(["customer", "entity"]);
export type UsageWindowScope = z.infer<typeof UsageWindowScopeSchema>;

export const UsageWindowLimitSchema = z.object({
	feature_id: z.string(),
	internal_feature_id: z.string(),
	internal_customer_id: z.string(),
	key: z.string(),
	dimension_type: UsageWindowDimensionSchema,
	dimension_feature_id: z.string().nullable(),
	scope_type: UsageWindowScopeSchema,
	entity_id: z.string().nullable(),
	internal_entity_id: z.string().nullable(),
	filter_key: z.string().nullable(),
	filter_properties: z.record(z.string(), z.string()).nullable(),
	interval: z.enum(EntInterval),
	window_start_at: z.number(),
	window_end_at: z.number(),
	limit: z.number(),
	anchor_customer_entitlement_id: z.string().nullable(),
	anchor_mode: UsageLimitAnchorSchema.default("billing_cycle"),
	new_window_id: z.string().optional(),
});

export type UsageWindowLimit = z.infer<typeof UsageWindowLimitSchema>;

export type UsageWindowRoll = {
	id: string;
	feature_id: string;
	internal_entity_id: string | null;
	filter_key: string | null;
	zero_usage: boolean;
	window_start_at: number;
	window_end_at: number;
	anchor_customer_entitlement_id: string | null;
};

export type UsageWindowFeature = Pick<Feature, "id" | "internal_id" | "type">;
