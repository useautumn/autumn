import { z } from "zod/v4";

/**
 * Per-item shape produced by the `ensure_prices_and_entitlements`
 * prepare module. Identifies one shared entitlement row keyed by
 * deterministic id per (migration, product version, feature).
 */
export const EntitlementItemRefSchema = z.object({
	entitlement_id: z.string(),
	product_internal_id: z.string(),
	product_id: z.string(),
	feature_id: z.string(),
	internal_feature_id: z.string(),
});

export type EntitlementItemRef = z.infer<typeof EntitlementItemRefSchema>;

/**
 * Strict typed payload for this module. Stored under the module key in
 * `migrations.prepared_state` and surfaced as `result` in the prepare
 * response envelope.
 */
export const EnsurePricesAndEntitlementsResultSchema = z.object({
	entitlements: z.array(EntitlementItemRefSchema),
});

export type EnsurePricesAndEntitlementsResult = z.infer<
	typeof EnsurePricesAndEntitlementsResultSchema
>;

/**
 * Strict module-level envelope — same shape as the orchestrator's
 * `PrepareModuleResult` but with a literal `kind` and the typed
 * `result`. Used at the module's call site for type safety.
 */
export const EnsurePricesAndEntitlementsModuleResultSchema = z.object({
	key: z.string(),
	kind: z.literal("ensure_prices_and_entitlements"),
	result: EnsurePricesAndEntitlementsResultSchema,
});

export type EnsurePricesAndEntitlementsModuleResult = z.infer<
	typeof EnsurePricesAndEntitlementsModuleResultSchema
>;
