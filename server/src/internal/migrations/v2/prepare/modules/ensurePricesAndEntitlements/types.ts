import { EntitlementSchema, PriceSchema } from "@autumn/shared";
import { z } from "zod/v4";

export const PreparedArtifactRefSchema = z.object({
	op_index: z.number(),
	kind: z.enum(["base_price", "add_item"]),
	item_index: z.number().optional(),
	hash: z.string(),
	internal_product_id: z.string(),
	price_id: z.string().optional(),
	entitlement_id: z.string().optional(),
});

export type PreparedArtifactRef = z.infer<typeof PreparedArtifactRefSchema>;

export const EnsurePricesAndEntitlementsResultSchema = z.object({
	entitlements: z.array(EntitlementSchema),
	prices: z.array(PriceSchema),
	artifacts: z.array(PreparedArtifactRefSchema),
});

export type EnsurePricesAndEntitlementsResult = z.infer<
	typeof EnsurePricesAndEntitlementsResultSchema
>;

export const EnsurePricesAndEntitlementsModuleResultSchema = z.object({
	key: z.string(),
	kind: z.literal("ensure_prices_and_entitlements"),
	result: EnsurePricesAndEntitlementsResultSchema,
});

export type EnsurePricesAndEntitlementsModuleResult = z.infer<
	typeof EnsurePricesAndEntitlementsModuleResultSchema
>;
