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
 * A single windowed usage counter scoped beneath a customer entitlement.
 *
 * This is the embedded counter state. The enforced limit is resolved at
 * deduction time (mirroring spend limits), so `limit_snapshot` is audit-only,
 * never the enforcement source. `key` is built by `buildUsageWindowKey`.
 *
 * `usage_amount` is in the dimension's native units (e.g. workflow count);
 * `balance_amount` records the pool/credit units consumed, for attribution.
 */
export const UsageWindowSchema = z.object({
	key: z.string(),
	dimension_type: UsageWindowDimensionSchema,
	dimension_feature_id: z.string().nullable(),
	scope_type: UsageWindowScopeSchema,
	entity_id: z.string().nullable(),
	internal_entity_id: z.string().nullable(),
	interval: z.enum(EntInterval),
	window_start_at: z.number(),
	window_end_at: z.number(),
	usage_amount: z.number(),
	balance_amount: z.number(),
	limit_snapshot: z.number().nullish(),
	updated_at: z.number(),
});

export type UsageWindow = z.infer<typeof UsageWindowSchema>;

/** Map of windowKey -> UsageWindow, embedded on a customer entitlement. */
export const UsageWindowsSchema = z.record(z.string(), UsageWindowSchema);
export type UsageWindows = z.infer<typeof UsageWindowsSchema>;

/**
 * A resolved, enforceable usage-window limit: the runtime input handed to the
 * deduction script. Built each deduction from the windowed usage cap
 * (`usage_limit_interval` + inherited/override limit) on a `spend_limit` billing
 * control plus the current window bounds (NOT stored).
 * Carries the resolved `limit` and `key`/window so Lua can find-or-create the
 * matching counter.
 */
export const UsageWindowLimitSchema = z.object({
	feature_id: z.string(),
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
	// The single entitlement that owns this counter, resolved in TS so it is
	// deduction-order-independent. Null when no eligible owner exists (e.g. a
	// customer-scope cap with only entity-scoped entitlements) -> enforcement
	// must fail closed rather than split or silently allow.
	anchor_customer_entitlement_id: z.string().nullable(),
	anchor_feature_id: z.string().nullable(),
});

export type UsageWindowLimit = z.infer<typeof UsageWindowLimitSchema>;
