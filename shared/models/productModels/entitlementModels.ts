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

  internal_feature_id: z.string().optional(),
  feature_id: z.string().optional(),
  product_id: z.string().optional(),

  allowance_type: z.nativeEnum(AllowanceType).optional().nullable(),
  allowance: z.number().optional().nullable(),
  interval: z.nativeEnum(EntInterval).optional().nullable(),

  is_custom: z.boolean().default(false).optional(),
});

export const CreateEntitlementSchema = EntitlementSchema.omit({
  id: true,
  org_id: true,
  created_at: true,
  product_id: true,
  is_custom: true,

  // Need
  // internal_feature_id
  // feature_id
  // allowance_type
  // allowance
  // interval
});

export type CreateEntitlement = z.infer<typeof CreateEntitlementSchema>;

export type Entitlement = z.infer<typeof EntitlementSchema>;

export const EntitlementWithFeatureSchema = EntitlementSchema.extend({
  feature: FeatureSchema,
});

export type EntitlementWithFeature = z.infer<
  typeof EntitlementWithFeatureSchema
>;
