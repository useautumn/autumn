import { z } from "zod";
import { PriceSchema } from "./priceModels.js";
import {
  EntitlementSchema,
  PublicEntitlementSchema,
} from "./entitlementModels.js";
import { FeatureSchema } from "../featureModels/featureModels.js";
import { FreeTrialSchema } from "./freeTrialModels.js";

export const ProductSchema = z.object({
  internal_id: z.string(),
  id: z.string(),
  org_id: z.string(),
  created_at: z.number(),
  env: z.string(),
  group: z.string(),

  processor: z
    .object({
      type: z.string(),
      id: z.string(),
    })
    .optional()
    .nullable(),

  name: z.string(),
  is_add_on: z.boolean(),
  is_default: z.boolean(),
});

export const CreateProductSchema = ProductSchema.omit({
  internal_id: true,
  org_id: true,
  created_at: true,
  env: true,
  processor: true,

  // Need name, is_add_on, is_default
});

export const FrontendProductSchema = ProductSchema.omit({
  org_id: true,
  created_at: true,
  env: true,
  processor: true,
}).extend({
  isActive: z.boolean(),
  prices: z.array(PriceSchema),
  entitlements: z.array(
    EntitlementSchema.extend({
      feature: FeatureSchema,
    })
  ),
  free_trial: FreeTrialSchema,
});

export const FullProductSchema = ProductSchema.extend({
  prices: z.array(PriceSchema),
  entitlements: z.array(
    EntitlementSchema.extend({
      feature: FeatureSchema,
    })
  ),
  free_trial: FreeTrialSchema.optional(),
});

export const PublicProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_add_on: z.boolean(),
  is_default: z.boolean(),
  group: z.string(),
  free_trial: FreeTrialSchema.nullish(),
  entitlements: z.array(PublicEntitlementSchema),
  fixed_prices: z.array(PriceSchema),
});

export type Product = z.infer<typeof ProductSchema>;
export type FrontendProduct = z.infer<typeof FrontendProductSchema>;
export type FullProduct = z.infer<typeof FullProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type PublicProduct = z.infer<typeof PublicProductSchema>;
