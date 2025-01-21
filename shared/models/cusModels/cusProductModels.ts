import { z } from "zod";
import { ProcessorType } from "../genModels.js";
import { ProductSchema } from "../productModels/productModels.js";

export const BillingCycleAnchorConfig = z.object({
  month: z.number(),
  day: z.number(),
  hour: z.number(),
  minute: z.number(),
  second: z.number(),
});

export enum CusProductStatus {
  Active = "active",
  PastDue = "past_due",
  Expired = "expired",

  Scheduled = "scheduled",
}

export const CusProductSchema = z.object({
  id: z.string(),
  internal_customer_id: z.string(),
  customer_id: z.string(),
  product_id: z.string(),
  created_at: z.number(),

  // Useful for event-driven subscriptions (and usage-based to check limits)
  status: z.nativeEnum(CusProductStatus),

  starts_at: z.number().default(Date.now()),
  canceled_at: z.number().optional().nullable(),
  ended_at: z.number().optional().nullable(),

  // Fixed-cycle configuration
  processor: z
    .object({
      type: z.nativeEnum(ProcessorType),
      subscription_id: z.string().optional().nullable(),
      subscription_schedule_id: z.string().optional().nullable(),
    })
    .optional(),
});

export type CusProduct = z.infer<typeof CusProductSchema>;

export const CusProductWithProduct = CusProductSchema.extend({
  product: ProductSchema,
});

export type CusProductWithProduct = z.infer<typeof CusProductWithProduct>;
