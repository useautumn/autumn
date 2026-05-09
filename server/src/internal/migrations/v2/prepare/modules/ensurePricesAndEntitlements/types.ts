import { EntitlementSchema, PriceSchema } from "@autumn/shared";
import { z } from "zod/v4";

export const PreparedArtifactRefSchema = z.object({
	op_index: z.number(),
	kind: z.enum(["base_price", "add_item"]),
	item_index: z.number().optional(),
	hash: z.string(),
	price_id: z.string().optional(),
	entitlement_id: z.string().optional(),
});

export type PreparedArtifactRef = z.infer<typeof PreparedArtifactRefSchema>;

/**
 * Strict typed payload for this module. Stored under the module key in
 * `migrations.prepared_state` and surfaced as `result` in the prepare
 * response envelope.
 */
export const EnsurePricesAndEntitlementsResultSchema = z.object({
	entitlements: z.array(EntitlementSchema),
	prices: z.array(PriceSchema),
	artifacts: z.array(PreparedArtifactRefSchema),
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
