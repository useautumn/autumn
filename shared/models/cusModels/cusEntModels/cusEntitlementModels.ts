import { z } from "zod";
import {
  EntitlementSchema,
  EntitlementWithFeatureSchema,
} from "../../productModels/entitlementModels.js";
import { FeatureSchema } from "../../featureModels/featureModels.js";

export const EntityBalanceSchema = z.object({
  id: z.string(),
  balance: z.number(),
  adjustment: z.number(),
});
export type EntityBalance = z.infer<typeof EntityBalanceSchema>;
export const CustomerEntitlementSchema = z.object({
  // Foreign keys
  id: z.string(),
  internal_customer_id: z.string(),
  internal_feature_id: z.string(),
  customer_id: z.string().nullish(), // for debugging purposes
  feature_id: z.string(), // for debugging purposes

  customer_product_id: z.string(),
  entitlement_id: z.string().nullable(),
  created_at: z.number(),

  // Balance fields
  unlimited: z.boolean().nullish(),
  balance: z.number().nullable(),

  usage_allowed: z.boolean().nullable(),
  next_reset_at: z.number().nullable(),
  adjustment: z.number().nullish().default(0),

  // Group by fields
  entities: z.record(z.string(), EntityBalanceSchema).nullish(),
});

export const FullCustomerEntitlementSchema = CustomerEntitlementSchema.extend({
  entitlement: EntitlementWithFeatureSchema,
});

export const CusEntWithEntitlementSchema = CustomerEntitlementSchema.extend({
  entitlement: EntitlementSchema,
});

export const CusEntWithFeatureSchema = CustomerEntitlementSchema.extend({
  feature: FeatureSchema,
});

export const CusEntWithFeatureAndEntitlementSchema =
  CusEntWithFeatureSchema.extend({
    entitlement: EntitlementSchema,
  });

export type CusEntWithFeatureAndEntitlement = z.infer<
  typeof CusEntWithFeatureAndEntitlementSchema
>;
export type CustomerEntitlement = z.infer<typeof CustomerEntitlementSchema>;
export type CusEntWithEntitlement = z.infer<typeof CusEntWithEntitlementSchema>;
export type CusEntWithFeature = z.infer<typeof CusEntWithFeatureSchema>;

export type FullCustomerEntitlement = z.infer<
  typeof FullCustomerEntitlementSchema
>;
