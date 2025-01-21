import { z } from "zod";
import { BillingInterval } from "./fixedPriceModels.js";

export enum BillWhen {
  InAdvance = "in_advance",
  BelowThreshold = "below_threshold",

  // Usage Debt
  // OnBillingCycle = "on_billing_cycle",
  // OnUsage = "on_usage",
  // Usage Credit
}

export const UsageTier = z.object({
  from: z.number().min(0),
  to: z.number().min(-1),
  amount: z.number().min(0),
});

export const UsagePriceConfigSchema = z.object({
  type: z.string(),
  bill_when: z.nativeEnum(BillWhen),
  entitlement_id: z.string(),
  usage_tiers: z.array(UsageTier),
  interval: z.nativeEnum(BillingInterval).optional(),
});

export type UsagePriceConfig = z.infer<typeof UsagePriceConfigSchema>;
