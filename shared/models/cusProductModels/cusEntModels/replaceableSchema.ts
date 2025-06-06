import { z } from "zod";

export const ReplaceableSchema = z.object({
  id: z.string(),
  cus_ent_id: z.string(),
  created_at: z.number(),
  from_entity_id: z.string(),
  delete_next_cycle: z.boolean(),
});

export type Replaceable = z.infer<typeof ReplaceableSchema>;
