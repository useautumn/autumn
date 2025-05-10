import { z } from "zod";
import { CusProductStatus } from "./cusProductModels.js";
import { AppEnv, EntInterval } from "../genModels.js";
import { InvoiceResponseSchema } from "./invoiceModels/invoiceResponseModels.js";

export const CusProductResponseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  group: z.string().nullable(),
  status: z.nativeEnum(CusProductStatus),
  // created_at: z.number(),
  canceled_at: z.number().nullish(),
  started_at: z.number(),

  subscription_ids: z.array(z.string()).nullish(),

  current_period_start: z.number().nullish(),
  current_period_end: z.number().nullish(),
  entity_id: z.string().nullish(),
});

export const CusEntResponseSchema = z.object({
  feature_id: z.string(),
  interval: z.nativeEnum(EntInterval).nullish(),
  unlimited: z.boolean().nullish(),
  balance: z.number().nullish(), //
  usage: z.number().nullish(),
  included_usage: z.number().nullish(),
  next_reset_at: z.number().nullish(),
});

export const CusEntResponseV2Schema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  interval: z.nativeEnum(EntInterval).or(z.literal("multiple")).nullish(),
  unlimited: z.boolean().nullish(),
  balance: z.number().nullish(),
  usage: z.number().nullish(),
  included_usage: z.number().nullish(),
  next_reset_at: z.number().nullish(),

  breakdown: z
    .array(
      z.object({
        interval: z.nativeEnum(EntInterval),
        balance: z.number().nullish(),
        usage: z.number().nullish(),
        included_usage: z.number().nullish(),
        next_reset_at: z.number().nullish(),
      })
    )
    .nullish(),
});

export const TrialUsedResponseSchema = z.object({
  product_id: z.string(),
  customer_id: z.string(),
  fingerprint: z.string(),
});

export const CusResponseSchema = z.object({
  // Internal fields
  autumn_id: z.string().nullish(),

  id: z.string().nullable(),
  created_at: z.number(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  fingerprint: z.string().nullable(),
  stripe_id: z.string().nullable().default(null),
  env: z.nativeEnum(AppEnv),

  products: z.array(CusProductResponseSchema),
  features: z.any(),

  invoices: z.array(InvoiceResponseSchema).optional(),
  trials_used: z.array(TrialUsedResponseSchema).optional(),
});

export type CusResponse = z.infer<typeof CusResponseSchema>;

export type CusEntResponse = z.infer<typeof CusEntResponseSchema>;
export type CusEntResponseV2 = z.infer<typeof CusEntResponseV2Schema>;
export type CusProductResponse = z.infer<typeof CusProductResponseSchema>;
