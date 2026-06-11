import { z } from "zod/v4";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";

/**
 * Which dimension a usage window counts against:
 * - `balance`: the credit pool / balance itself (e.g. "max 3 credits/day")
 * - `metered_feature`: a member feature within a credit system
 *   (e.g. "max 5 workflows", independent of credits remaining)
 */
export const UsageWindowDimensionSchema = z.enum([
	"balance",
	"metered_feature",
]);
export type UsageWindowDimension = z.infer<typeof UsageWindowDimensionSchema>;

/** Whether the window is tracked per-customer (aggregate) or per-entity. */
export const UsageWindowScopeSchema = z.enum(["customer", "entity"]);
export type UsageWindowScope = z.infer<typeof UsageWindowScopeSchema>;

/**
 * A resolved, enforceable usage-window limit: the runtime input handed to the
 * deduction script. Built each deduction from the windowed usage cap
 * (`usage_limit` + optional `usage_limit_interval` override) on a `spend_limit` billing
 * control plus the current window bounds (NOT stored).
 * Carries the resolved `limit` and `key`/window so Lua can find-or-create the
 * matching counter.
 */
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
	interval: z.enum(EntInterval),
	window_start_at: z.number(),
	window_end_at: z.number(),
	limit: z.number(),
	// Bounds/interval provenance: the entitlement whose reset interval and
	// billing-cycle anchor shaped this window. Stamped onto the counter row at
	// creation; storage no longer depends on it, so null just means calendar
	// bounds with no provenance.
	anchor_customer_entitlement_id: z.string().nullable(),
	// Candidate row id (ksuid) minted server-side per request. Lua uses it ONLY
	// when this request creates the counter row; lookups match the logical key
	// (window_start_at + entity), never the id.
	new_window_id: z.string().optional(),
});

export type UsageWindowLimit = z.infer<typeof UsageWindowLimitSchema>;
