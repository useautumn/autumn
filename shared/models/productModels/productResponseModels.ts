import { z } from "zod";
import { AppEnv } from "../genModels.js";
import { ProductItemSchema } from "./productItemModels.js";
import { FreeTrialResponseSchema, FreeTrialSchema } from "./freeTrialModels.js";

export const ProductResponseSchema = z.object({
  // internal_id: z.string(),
  autumn_id: z.string(),
  id: z.string(),
  name: z.string(),
  env: z.nativeEnum(AppEnv),
  is_add_on: z.boolean(),
  is_default: z.boolean(),
  group: z.string(),
  version: z.number(),
  created_at: z.number(),

  items: z.array(ProductItemSchema),
  free_trial: FreeTrialResponseSchema.nullable(),
});

export type ProductResponse = z.infer<typeof ProductResponseSchema>;
