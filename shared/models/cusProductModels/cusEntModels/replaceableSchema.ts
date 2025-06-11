import { z } from "zod";
import { EntitlementSchema } from "../../productModels/entModels/entModels.js";

export const ReplaceableSchema = z.object({
  id: z.string(),
  cus_ent_id: z.string(),
  created_at: z.number(),
  from_entity_id: z.string().nullish(),
  delete_next_cycle: z.boolean(),
});

export const AttachReplaceableSchema = z.object({
  ent: EntitlementSchema,
  id: z.string(),
  created_at: z.number(),
  from_entity_id: z.string().nullish(),
  delete_next_cycle: z.boolean(),
});

// export type Replaceable = z.infer<typeof ReplaceableSchema>;
export type AttachReplaceable = z.infer<typeof AttachReplaceableSchema>;
