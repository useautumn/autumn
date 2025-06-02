import { z } from "zod";
import { CusProductStatus } from "../../cusProductModels/cusProductEnums.js";

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
