import { z } from "zod";

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

export const PriceTierSchema = z.object({
  to: z.number().or(z.string()),
  amount: z.number(),
});

export const CreateProductItemSchema = z.object({
  // Feature stuff
  feature_id: z.string(),
  included_usage: z.union([z.number(), z.literal("unlimited")]), // can only be set if tiers are not provided

  interval: z.nativeEnum(ProductItemInterval),
  reset_usage_on_interval: z.boolean().nullish(),

  // Price config
  amount: z.number().nullish(),
  tiers: z.array(PriceTierSchema).nullish(),
  billing_units: z.number().nullish(), // amount per billing unit (eg. $9 / 250 units)

  // Others
  entity_feature_id: z.string().nullish(),
  carry_over_usage: z.boolean().nullish(),
});

export type CreateProductItem = z.infer<typeof CreateProductItemSchema>;
