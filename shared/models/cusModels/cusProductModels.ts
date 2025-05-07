import { z } from "zod";
import { ProcessorType } from "../genModels.js";
import { ProductSchema } from "../productModels/productModels.js";
import { CustomerPriceSchema } from "./cusPriceModels/cusPriceModels.js";
import { PriceSchema } from "../productModels/priceModels.js";
import { CustomerEntitlementSchema } from "./cusEntModels/cusEntitlementModels.js";
import { EntitlementSchema } from "../productModels/entitlementModels.js";
import { FeatureSchema } from "../featureModels/featureModels.js";
import { CustomerSchema } from "./cusModels.js";
import { FreeTrialSchema } from "../productModels/freeTrialModels.js";

export const FeatureOptionsSchema = z.object({
  internal_feature_id: z.string().optional(),
  feature_id: z.string(),
  adjustable_quantity: z.boolean().nullish(),

  // Quantities
  quantity: z.number().optional().nullable(), // same as prepaid
  prepaid_quantity: z.number().nullish(),

  usage_quantity: z.number().nullish(),
});

export enum CollectionMethod {
  ChargeAutomatically = "charge_automatically",
  SendInvoice = "send_invoice",
}

export const BillingCycleAnchorConfig = z.object({
  month: z.number(),
  day: z.number(),
  hour: z.number(),
  minute: z.number(),
  second: z.number(),
});

export enum CusProductStatus {
  Scheduled = "scheduled",
  Active = "active",
  PastDue = "past_due",
  Expired = "expired",
  Unknown = "unknown",
  Trialing = "trialing",
}

export const CusProductSchema = z.object({
  id: z.string(),
  internal_product_id: z.string(),
  product_id: z.string(),
  internal_customer_id: z.string(),
  customer_id: z.string().nullish(),
  internal_entity_id: z.string().nullish(),
  entity_id: z.string().nullish(),
  created_at: z.number(),

  // Useful for event-driven subscriptions (and usage-based to check limits)
  status: z.nativeEnum(CusProductStatus),

  starts_at: z.number().default(Date.now()),
  trial_ends_at: z.number().optional().nullable(),
  canceled_at: z.number().optional().nullable(),
  ended_at: z.number().optional().nullable(),

  options: z.array(FeatureOptionsSchema),
  free_trial_id: z.string().optional().nullable(),
  collection_method: z.nativeEnum(CollectionMethod),

  // Fixed-cycle configuration
  subscription_ids: z.array(z.string()).nullish(),
  scheduled_ids: z.array(z.string()).nullish(),
  processor: z
    .object({
      type: z.nativeEnum(ProcessorType),
      subscription_id: z.string().optional().nullable(),
      subscription_schedule_id: z.string().optional().nullable(),
      last_invoice_id: z.string().optional().nullable(),
    })
    .optional(),

  quantity: z.number().default(1),
});

export type CusProduct = z.infer<typeof CusProductSchema>;

export const CusProductWithProduct = CusProductSchema.extend({
  product: ProductSchema,
});

export type CusProductWithProduct = z.infer<typeof CusProductWithProduct>;
export type FeatureOptions = z.infer<typeof FeatureOptionsSchema>;

export const FullCusProductSchema = CusProductSchema.extend({
  customer_prices: z.array(
    CustomerPriceSchema.extend({
      price: PriceSchema,
    })
  ),

  customer_entitlements: z.array(
    CustomerEntitlementSchema.extend({
      entitlement: EntitlementSchema.extend({
        feature: FeatureSchema,
      }),
    })
  ),

  customer: CustomerSchema,
  product: ProductSchema,
  free_trial: FreeTrialSchema.nullish(),
  is_custom: z.boolean().default(false),
});

export type FullCusProduct = z.infer<typeof FullCusProductSchema>;
