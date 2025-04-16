import { z } from "zod";
import { ProductItemSchema } from "./productItemModels.js";
import { FreeTrialSchema } from "./freeTrialModels.js";

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
});

export type ProductV2 = z.infer<typeof ProductV2Schema>;
