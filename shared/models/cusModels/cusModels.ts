import { z } from "zod";
import { AppEnv } from "../genModels.js";

export const CustomerSchema = z.object({
  internal_id: z.string(),
  org_id: z.string(),
  created_at: z.number(),
  env: z.nativeEnum(AppEnv),
  processor: z.any(),
  fingerprint: z.string().nullish(),

  id: z.string(), // given by user
  name: z.string(),
  email: z.string().optional(),
});

export const CreateCustomerSchema = CustomerSchema.omit({
  internal_id: true,
  org_id: true,
  created_at: true,
  env: true,
  processor: true,
  fingerprint: true,
});

export type Customer = z.infer<typeof CustomerSchema>;
