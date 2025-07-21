import {
  PriceTierSchema,
  ProductItemInterval,
  ProductItemSchema,
} from "@autumn/shared";
import { z } from "zod";

export const FeaturePriceItemSchema = ProductItemSchema.pick({
  feature_id: true,
  feature_type: true,
  included_usage: true,
  interval: true,
  usage_model: true,

  price: true,
  tiers: true,
  billing_units: true,

  reset_usage_when_enabled: true,
  usage_limit: true,
  config: true,
}).extend({
  feature_id: z.string().nonempty(),
  included_usage: z.number().nonnegative().nullish(),
});

export type FeaturePriceItem = z.infer<typeof FeaturePriceItemSchema>;
