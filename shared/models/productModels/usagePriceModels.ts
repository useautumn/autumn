import { z } from "zod";
import { BillingInterval } from "./fixedPriceModels.js";
import { TierInfinite } from "./productItemModels.js";

export enum BillWhen {
  // Deprecated
  InAdvance = "in_advance",

  // Latest
  StartOfPeriod = "start_of_period",
  EndOfPeriod = "end_of_period",

  // Seat based
  // Licensed = "on_usage",
  BelowThreshold = "below_threshold",
}

export const UsageTierSchema = z.object({
  // from: z.number(),
  to: z.number().or(z.literal(TierInfinite)),
  amount: z.number(),
});

export const UsagePriceConfigSchema = z.object({
  type: z.string(),
  bill_when: z.nativeEnum(BillWhen),
  billing_units: z.number().nullish(),

  // entitlement_id: z.string().nullish(),
  internal_feature_id: z.string(),
  feature_id: z.string(),

  usage_tiers: z.array(UsageTierSchema),
  interval: z.nativeEnum(BillingInterval).optional(),

  // For usage in arrear
  stripe_meter_id: z.string().nullish(),
  stripe_price_id: z.string().nullish(),
  stripe_product_id: z.string().nullish(),
  stripe_placeholder_price_id: z.string().nullish(),
  stripe_event_name: z.string().nullish(),

  should_prorate: z.boolean().optional(),
});

export type UsagePriceConfig = z.infer<typeof UsagePriceConfigSchema>;
