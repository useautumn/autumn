import { z } from "zod";
import { AppEnv } from "../genModels.js";
import { CusProductSchema, FullCusProductSchema } from "./cusProductModels.js";
import { ProductSchema } from "../productModels/productModels.js";

export const CustomerSchema = z.object({
  id: z.string().nullish(), // given by user
  name: z.string().nullish(),
  email: z.string().nullish(),
  fingerprint: z.string().nullish(),

  // Internal
  internal_id: z.string(),
  org_id: z.string(),
  created_at: z.number(),
  env: z.nativeEnum(AppEnv),
  processor: z.any(),
});

export const CreateCustomerSchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9_@-]+$/) // Allow alphanumeric characters, underscores, hyphens, and @
    .nullish(), // id is not allowed whitespace characters
  name: z.string().nullish(),
  email: z.string().nullish(),
  fingerprint: z.string().nullish(),
});

export const CustomerDataSchema = z.object({
  name: z.string().nullish(),
  email: z.string().nullish(),
  fingerprint: z.string().nullish(),
});

export const CustomerResponseSchema = CustomerSchema.omit({
  // created_at: true,
  // env: true,
  // processor: true,
  org_id: true,
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerData = z.infer<typeof CustomerDataSchema>;
export type CustomerResponse = z.infer<typeof CustomerResponseSchema>;
export type CreateCustomer = z.infer<typeof CreateCustomerSchema>;
