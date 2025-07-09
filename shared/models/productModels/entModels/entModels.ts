import { z } from "zod";
import { FeatureSchema } from "../../featureModels/featureModels.js";
import { EntInterval } from "./entEnums.js";

export enum AllowanceType {
  Fixed = "fixed",
  Unlimited = "unlimited",
  None = "none",
}

export const EntitlementSchema = z.object({
  // Required fields - no .optional()
  id: z.string(),
  created_at: z.number(),
  internal_feature_id: z.string(),
  internal_product_id: z.string(),
  is_custom: z.boolean().default(false),

  allowance_type: z.nativeEnum(AllowanceType).optional().nullable(),
  allowance: z.number().nullish(),
  interval: z.nativeEnum(EntInterval).optional().nullable(),

  carry_from_previous: z.boolean().default(false).optional(),
  entity_feature_id: z.string().nullish(),

  // Part of create entitlement
  org_id: z.string().optional(),
  feature_id: z.string().optional(),
  usage_limit: z.number().nullable().optional().default(null),
});

export const CreateEntitlementSchema = z.object({
  id: z.string().nullish(),
  internal_feature_id: z.string(),
  feature_id: z.string(),
  allowance_type: z.nativeEnum(AllowanceType).nullish(),
  allowance: z.number().nullish(),
  interval: z.nativeEnum(EntInterval).nullish(),
  carry_from_previous: z.boolean().default(false),
  entity_feature_id: z.string().nullish(),
  usage_limit: z.number().nullish().default(null),
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
