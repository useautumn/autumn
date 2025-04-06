import { z } from "zod";
import { PriceSchema } from "./priceModels.js";
import {
  EntitlementSchema,
  PublicEntitlementSchema,
} from "./entitlementModels.js";
import { FeatureSchema } from "../featureModels/featureModels.js";
import { FreeTrialSchema } from "./freeTrialModels.js";

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_add_on: z.boolean(),
  is_default: z.boolean(),
  version: z.number(),
  group: z.string(),

  env: z.string(),
  internal_id: z.string(),
  org_id: z.string(),
  created_at: z.number(),

  processor: z
    .object({
      type: z.string(),
      id: z.string(),
    })
    .nullish(),
});

export const CreateProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_add_on: z.boolean(),
  is_default: z.boolean(),
  version: z.number().default(1),
  group: z.string(),
});

export const UpdateProductSchema = z.object({
  id: z.string().nullish(),
  name: z.string().optional(),
  is_add_on: z.boolean().optional(),
  is_default: z.boolean().optional(),
  group: z.string().optional(),
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
  options: z.any(),
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
  usage_prices: z.array(PriceSchema),
});

export type Product = z.infer<typeof ProductSchema>;
export type FrontendProduct = z.infer<typeof FrontendProductSchema>;
export type FullProduct = z.infer<typeof FullProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type PublicProduct = z.infer<typeof PublicProductSchema>;

export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
