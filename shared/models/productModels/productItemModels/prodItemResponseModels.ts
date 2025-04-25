import { z } from "zod";
import {
  Infinite,
  PriceTierSchema,
  ProductItemFeatureType,
  ProductItemInterval,
  UsageModel,
} from "../productItemModels.js";

export const ProductItemResponseSchema = z.object({
  // Feature stuff
  feature_id: z.string().nullish(),
  feature_type: z.nativeEnum(ProductItemFeatureType).nullish(),

  included_usage: z.number().or(z.literal(Infinite)).nullish(),
  interval: z.nativeEnum(ProductItemInterval).nullish(),

  // Price config
  price: z.number().nullish(),
  tiers: z.array(PriceTierSchema).nullish(),
  usage_model: z.nativeEnum(UsageModel).nullish(),
  billing_units: z.number().nullish(), // amount per billing unit (eg. $9 / 250 units)
  reset_usage_when_enabled: z.boolean().nullish(),

  // Others
  // entity_feature_id: z.string().nullish(),
  // carry_over_usage: z.boolean().nullish(),

  // Stored in backend
  // created_at: z.number().nullish(),
  // entitlement_id: z.string().nullish(),
  // price_id: z.string().nullish(),
  // price_config: z.any().nullish(),
});
