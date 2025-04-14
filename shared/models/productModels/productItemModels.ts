import { z } from "zod";
import { FeatureSchema, FeatureType } from "../featureModels/featureModels.js";

export const TierInfinite = "inf";
export const Infinite = "inf";
export const UsageUnlimited = "unlimited";

export enum ProductItemInterval {
  None = "none",

  // Reset interval
  Minute = "minute",
  Hour = "hour",
  Day = "day",

  // Billing interval
  Month = "month",
  Quarter = "quarter",
  SemiAnnual = "semi_annual",
  Year = "year",
}

export enum ProductItemType {
  Feature = "feature",
  FeaturePrice = "feature_price",
  Price = "price",
}

export const PriceTierSchema = z.object({
  to: z.number().or(z.literal(TierInfinite)),
  amount: z.number(),
});

export enum ProductItemBehavior {
  Prepaid = "prepaid",
  PayPerUse = "pay_per_use",
}

export const ProductItemSchema = z.object({
  // Feature stuff
  feature_id: z.string().nullish(),
  included_usage: z.union([z.number(), z.literal(Infinite)]).nullish(),

  interval: z.nativeEnum(ProductItemInterval).nullish(),
  reset_interval: z.nativeEnum(ProductItemInterval).nullish(),
  reset_usage_on_billing: z.boolean().nullish(),

  // Price config
  behavior: z.nativeEnum(ProductItemBehavior).nullish(),

  amount: z.number().nullish(),
  tiers: z.array(PriceTierSchema).nullish(),
  billing_units: z.number().nullish(), // amount per billing unit (eg. $9 / 250 units)

  // Others
  entity_feature_id: z.string().nullish(),
  carry_over_usage: z.boolean().nullish(),

  // Stored in backend
  created_at: z.number().nullish(),
  entitlement_id: z.string().nullish(),
  price_id: z.string().nullish(),
  price_config: z.any().nullish(),
});

export type ProductItem = z.infer<typeof ProductItemSchema>;
