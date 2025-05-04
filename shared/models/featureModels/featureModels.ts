import { z } from "zod";
import { AppEnv } from "../genModels.js";

export enum FeatureType {
  Boolean = "boolean",
  Metered = "metered",
  CreditSystem = "credit_system",
}

export enum AggregateType {
  Count = "count",
  Sum = "sum",
}

export const FeatureSchema = z.object({
  internal_id: z.string().optional(),
  org_id: z.string().optional(),
  created_at: z.number().optional(),
  env: z.nativeEnum(AppEnv).optional(),

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

export const CreateFeatureSchema = FeatureSchema.omit({
  internal_id: true,
  org_id: true,
  created_at: true,
  env: true,
});

export const FeatureResponseSchema = z.object({
  internal_id: z.string(),
  id: z.string(),
  name: z.string(),
  type: z.nativeEnum(FeatureType),
  config: z.any(),
});

export type Feature = z.infer<typeof FeatureSchema>;
