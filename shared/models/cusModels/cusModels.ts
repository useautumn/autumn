import { z } from "zod";
import { AppEnv } from "../genModels.js";

export const CustomerSchema = z.object({
  internal_id: z.string(),
  org_id: z.string(),
  created_at: z.number(),
  env: z.nativeEnum(AppEnv),
  processor: z.any(),

  id: z.string(), // given by user

  name: z.string().nullish(),
  email: z.string().nullish(),
  fingerprint: z.string().nullish(),
});

export const CreateCustomerSchema = CustomerSchema.omit({
  internal_id: true,
  org_id: true,
  created_at: true,
  env: true,
  processor: true,
  fingerprint: true,
});

export const CustomerDataSchema = z.object({
  name: z.string().nullish(),
  email: z.string().nullish(),
  fingerprint: z.string().nullish(),
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerData = z.infer<typeof CustomerDataSchema>;
