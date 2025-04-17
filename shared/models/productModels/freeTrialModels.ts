import { z } from "zod";

export enum FreeTrialDuration {
  Day = "day",
  // Week = "week",
  // Month = "month",
  // Year = "year",
}

export const FreeTrialSchema = z.object({
  id: z.string(),
  duration: z.nativeEnum(FreeTrialDuration),
  length: z.number(),
  unique_fingerprint: z.boolean(),

  created_at: z.number(),
  internal_product_id: z.string(),
  is_custom: z.boolean(),
});

export const CreateFreeTrialSchema = z.object({
  length: z
    .string()
    .or(z.number())
    .transform((val) => Number(val)),
  unique_fingerprint: z.boolean(),
});

export const FreeTrialResponseSchema = FreeTrialSchema.extend({
  id: z.string(),
  duration: z.nativeEnum(FreeTrialDuration),
  length: z.number(),
  unique_fingerprint: z.boolean(),
  // created_at: z.number(),
});

export type FreeTrial = z.infer<typeof FreeTrialSchema>;
export type CreateFreeTrial = z.infer<typeof CreateFreeTrialSchema>;
export type FreeTrialResponse = z.infer<typeof FreeTrialResponseSchema>;
