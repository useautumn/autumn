import { z } from "zod";
import { AppEnv } from "../genModels/genEnums.js";
import { FeatureType } from "./featureEnums.js";

export const FeatureSchema = z.object({
  internal_id: z.string(),
  org_id: z.string(),
  created_at: z.number(),
  env: z.nativeEnum(AppEnv),

  id: z.string().nonempty(),
  name: z.string().nonempty(),
  type: z.nativeEnum(FeatureType),
  config: z.any(),
  display: z
    .object({
      singular: z.string().optional(),
      plural: z.string().optional(),
    })
    .nullish(),
});

export const CreateFeatureSchema = FeatureSchema.pick({
  id: true,
  name: true,
  type: true,
  config: true,
  display: true,
});

export const FeatureResponseSchema = z.object({
  internal_id: z.string(),
  id: z.string(),
  name: z.string(),
  type: z.nativeEnum(FeatureType),
  config: z.any(),
});

export type Feature = z.infer<typeof FeatureSchema>;
export type CreateFeature = z.infer<typeof CreateFeatureSchema>;
