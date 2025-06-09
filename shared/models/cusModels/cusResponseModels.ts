import { z } from "zod";
import { AppEnv } from "../genModels/genEnums.js";
import { InvoiceResponseSchema } from "./invoiceModels/invoiceResponseModels.js";
import { RewardResponseSchema } from "../rewardModels/rewardModels/rewardResponseModels.js";
import { EntityResponseSchema } from "./entityModels/entityResModels.js";
import { CusProductResponseSchema } from "./cusResModels/cusProductResponse.js";

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
  rewards: RewardResponseSchema.nullish(),
  metadata: z.record(z.any()).default({}),
  entities: z.array(EntityResponseSchema).optional(),
});

export type CusResponse = z.infer<typeof CusResponseSchema>;
export type CusProductResponse = z.infer<typeof CusProductResponseSchema>;
