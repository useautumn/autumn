import { z } from "zod";
import { FeatureSchema, FeatureType } from "../featureModels/featureModels.js";
import { EntInterval } from "../genModels.js";
import { UsagePriceConfigSchema } from "./usagePriceModels.js";

export enum AllowanceType {
  Fixed = "fixed",
  Unlimited = "unlimited",
  None = "none",
}

export const EntitlementSchema = z.object({
  // Required fields - no .optional()
  id: z.string().optional(),
  org_id: z.string().optional(),
  created_at: z.number().optional(),
  is_custom: z.boolean().default(false).optional(),
  internal_product_id: z.string().optional(),

  // Part of create entitlement
  internal_feature_id: z.string().optional(),
  feature_id: z.string().optional(),
  allowance_type: z.nativeEnum(AllowanceType).optional().nullable(),
  allowance: z.number().nullish(),
  interval: z.nativeEnum(EntInterval).optional().nullable(),

  carry_from_previous: z.boolean().default(false).optional(),
  entity_feature_id: z.string().nullish(),
});

export const CreateEntitlementSchema = z.object({
  id: z.string().nullish(),
  internal_feature_id: z.string(),
  feature_id: z.string(),
  allowance_type: z.nativeEnum(AllowanceType).nullish(),
  allowance: z.union([z.number(), z.literal("unlimited")]).nullish(),
  interval: z.nativeEnum(EntInterval).nullish(),
  carry_from_previous: z.boolean().default(false),
  entity_feature_id: z.string().nullish(),
});

export const PublicEntitlementSchema = z.object({
  feature: z.object({
    id: z.string(),
    type: z.nativeEnum(FeatureType),
    name: z.string(),
  }),
  allowance_type: z.nativeEnum(AllowanceType).nullish(),
  allowance: z.number().nullish(),
  interval: z.nativeEnum(EntInterval).nullish(),
  price: UsagePriceConfigSchema.nullish(),
});

export type CreateEntitlement = z.infer<typeof CreateEntitlementSchema>;

export type Entitlement = z.infer<typeof EntitlementSchema>;

export const EntitlementWithFeatureSchema = EntitlementSchema.extend({
  feature: FeatureSchema,
});

export type EntitlementWithFeature = z.infer<
  typeof EntitlementWithFeatureSchema
>;

export type FullEntitlement = z.infer<typeof EntitlementWithFeatureSchema>;
