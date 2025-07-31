import { z } from "zod";
import { FreeTrialSchema } from "../productModels/freeTrialModels/freeTrialModels.js";
import { ProductItemSchema } from "./productItemModels/productItemModels.js";

export const ProductV2Schema = z.object({
  internal_id: z.string().nullish(),

  id: z.string(),
  name: z.string(),
  is_add_on: z.boolean(),
  is_default: z.boolean(),
  version: z.number().default(1),
  group: z.string(),

  free_trial: FreeTrialSchema.nullish(),
  items: z.array(ProductItemSchema),
  created_at: z.number(),
  stripe_id: z.string().nullish(),
  archived: z.boolean().default(false).nullish(),
});

export type ProductV2 = z.infer<typeof ProductV2Schema>;
