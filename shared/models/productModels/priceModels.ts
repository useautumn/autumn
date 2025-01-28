import { z } from "zod";
import { UsagePriceConfigSchema } from "./usagePriceModels.js";
import { FixedPriceConfigSchema } from "./fixedPriceModels.js";

export enum PriceType {
  Fixed = "fixed",
  Usage = "usage",
}

export enum BillingType {
  OneOff = "one_off",
  FixedCycle = "fixed_cycle",

  UsageBelowThreshold = "usage_below_threshold",
  UsageInAdvance = "usage_in_advance",
  UsageInArrear = "usage_in_arrear",
}

export const PriceSchema = z.object({
  id: z.string().optional(),
  org_id: z.string().optional(),
  internal_product_id: z.string().optional(),
  created_at: z.number().optional(),
  billing_type: z.nativeEnum(BillingType).optional(),
  is_custom: z.boolean().optional(),

  name: z.string().optional(),
  config: FixedPriceConfigSchema.or(UsagePriceConfigSchema).optional(),
});

export type Price = z.infer<typeof PriceSchema>;

export const CreatePriceSchema = z.object({
  name: z.string().nonempty(),
  config: FixedPriceConfigSchema.or(UsagePriceConfigSchema),
});

export type CreatePrice = z.infer<typeof CreatePriceSchema>;
