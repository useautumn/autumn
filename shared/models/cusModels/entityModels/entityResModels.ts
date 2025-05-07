import { AppEnv } from "../../genModels.js";
import {
  CusProductResponseSchema,
  CusEntResponseV2Schema,
} from "../cusResponseModels.js";
import { Entity } from "../entityModels/entityModels.js";
import { z } from "zod";
export const EntityResponseSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  customer_id: z.string(),
  created_at: z.number(),
  env: z.nativeEnum(AppEnv),

  products: z.record(z.string(), CusProductResponseSchema),

  features: z.record(z.string(), CusEntResponseV2Schema),
});

export type EntityResponse = z.infer<typeof EntityResponseSchema>;
