import { z } from "zod";
import { CusProductStatus } from "./cusProductModels.js";
import { EntInterval } from "../genModels.js";

export const CusProductResponseSchema = z.object({
  id: z.string().nullable().default(null),
  name: z.string(),
  group: z.string().nullable(),
  status: z.nativeEnum(CusProductStatus),
  // created_at: z.number(),
  canceled_at: z.number().nullish(),
  started_at: z.number(),

  subscription_ids: z.array(z.string()).nullish(),

  current_period_start: z.number().nullish(),
  current_period_end: z.number().nullish(),
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

export const CusResponseSchema = z.object({
  autumn_id: z.string(),
  id: z.string().nullable().default(null),
  name: z.string().nullable(),
  email: z.string().nullable(),
  fingerprint: z.string().nullable(),
  created_at: z.number(),
  stripe_id: z.string().nullish(),

  products: z.array(CusProductResponseSchema),
  add_ons: z.array(CusProductResponseSchema),
  features: z.any(),
  // invoices: z.array(CusInvoiceResponseSchema).nullish(),
});
