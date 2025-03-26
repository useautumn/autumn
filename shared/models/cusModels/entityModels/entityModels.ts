import { z } from "zod";

export const EntitySchema = z.object({
  id: z.string(),
  org_id: z.string(),
  created_at: z.number(),
  internal_id: z.string(),
  internal_customer_id: z.string(),
  env: z.string(),
  name: z.string(),
});

export const CreateEntitySchema = z.object({
  id: z.string(), // ID of entity
  name: z.string(), // Name of entity
  customer_id: z.string(), // Customer ID of entity
  feature_id: z.string(), // Feature ID of entity
});
