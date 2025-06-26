import { z } from "zod";
import { EntInterval } from "../../productModels/entModels/entEnums.js";

export const CusEntResponseSchema = z.object({
  feature_id: z.string(),
  interval: z.nativeEnum(EntInterval).nullish(),
  unlimited: z.boolean().nullish(),
  balance: z.number().nullish(), //
  usage: z.number().nullish(),
  included_usage: z.number().nullish(),
  next_reset_at: z.number().nullish(),
});

export const CoreCusFeatureResponseSchema = z.object({
  interval: z.nativeEnum(EntInterval).or(z.literal("multiple")).nullish(),
  unlimited: z.boolean().nullish(),
  balance: z.number().nullish(),
  usage: z.number().nullish(),
  included_usage: z.number().nullish(),
  next_reset_at: z.number().nullish(),

  breakdown: z
    .array(
      z.object({
        interval: z.nativeEnum(EntInterval),
        balance: z.number().nullish(),
        usage: z.number().nullish(),
        included_usage: z.number().nullish(),
        next_reset_at: z.number().nullish(),
      }),
    )
    .nullish(),
});

export const CusEntResponseV2Schema = z
  .object({
    id: z.string(),
    name: z.string().nullish(),
  })
  .extend(CoreCusFeatureResponseSchema.shape);

export const CheckResponseSchema = z
  .object({
    allowed: z.boolean(),
    customer_id: z.string(),
    feature_id: z.string(),
    entity_id: z.string().nullish(),
    required_balance: z.number(),
    code: z.string(),
  })
  .extend(CoreCusFeatureResponseSchema.shape);

export type CusEntResponse = z.infer<typeof CusEntResponseSchema>;
export type CusEntResponseV2 = z.infer<typeof CusEntResponseV2Schema>;
export type CheckResponse = z.infer<typeof CheckResponseSchema>;
