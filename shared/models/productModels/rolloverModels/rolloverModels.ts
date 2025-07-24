import { z } from "zod";
import { EntityBalance, EntityBalanceSchema } from "../../../index.js";
import { jsonb } from "drizzle-orm/pg-core";

export const RolloverModelSchema = z.object({
  id: z.string(),
  cus_ent_id: z.string(),
  balance: z.number(),
  entities: z.record(z.string(), EntityBalanceSchema),
  expires_at: z.number().nullable(),
});

export type RolloverModel = z.infer<typeof RolloverModelSchema>;
