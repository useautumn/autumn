import { z } from "zod";
import { FeatureSchema } from "../featureModels/featureModels.js";
import { EntInterval } from "../genModels.js";

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
  allowance: z.number().optional().nullable(),
  interval: z.nativeEnum(EntInterval).optional().nullable(),
});

export const CreateEntitlementSchema = z.object({
  internal_feature_id: z.string(),
  feature_id: z.string(),

  allowance_type: z.nativeEnum(AllowanceType).nullish(),
  allowance: z.number().nullish(),
  interval: z.nativeEnum(EntInterval).nullish(),
});

export type CreateEntitlement = z.infer<typeof CreateEntitlementSchema>;

export type Entitlement = z.infer<typeof EntitlementSchema>;

export const EntitlementWithFeatureSchema = EntitlementSchema.extend({
  feature: FeatureSchema,
});

export type EntitlementWithFeature = z.infer<
  typeof EntitlementWithFeatureSchema
>;
