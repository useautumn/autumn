import { z } from "zod";
import { Feature } from "../../featureModels/featureModels.js";

export const EntitySchema = z.object({
  id: z.string(),
  org_id: z.string(),
  created_at: z.number(),
  internal_id: z.string(),
  internal_customer_id: z.string(),
  env: z.string(),
  name: z.string(),
  deleted: z.boolean(),
  feature_id: z.string(),
  internal_feature_id: z.string(),
});

export const CreateEntitySchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  feature_id: z.string(),
});

export const EntityDataSchema = z.object({
  name: z.string(), // Name of entity
  feature_id: z.string(), // Feature ID of entity
});

export type Entity = z.infer<typeof EntitySchema>;
export type EntityWithFeature = Entity & {
  feature: Feature;
};
export type CreateEntity = z.infer<typeof CreateEntitySchema>;
export type EntityData = z.infer<typeof EntityDataSchema>;
