import { z } from "zod";

export enum FreeTrialDuration {
  Day = "day",
  // Week = "week",
  // Month = "month",
  // Year = "year",
}

export const FreeTrialSchema = z.object({
  id: z.string(),
  created_at: z.number(),
  duration: z.nativeEnum(FreeTrialDuration),
  internal_product_id: z.string(),
  is_custom: z.boolean(),

  length: z.number(),
  unique_fingerprint: z.boolean(),
});

export const CreateFreeTrialSchema = z.object({
  length: z
    .string()
    .or(z.number())
    .transform((val) => Number(val)),
  unique_fingerprint: z.boolean(),
});

export type FreeTrial = z.infer<typeof FreeTrialSchema>;
export type CreateFreeTrial = z.infer<typeof CreateFreeTrialSchema>;
