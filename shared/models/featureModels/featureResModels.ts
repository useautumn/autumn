import { z } from "zod";

export enum FeatureResType {
  Boolean = "boolean",
  SingleUsage = "single_use",
  ContinuousUse = "continuous_use",
  CreditSystem = "credit_system",
}
export const FeatureResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.nativeEnum(FeatureResType),
  display: z.object({
    singular: z.string(),
    plural: z.string(),
  }),
});

export type FeatureResponse = z.infer<typeof FeatureResponseSchema>;
