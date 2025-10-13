import { ApiFeatureSchema } from "@api/features/apiFeature.js";
import type { z } from "zod/v4";

export const UpdateFeatureParamsSchema = ApiFeatureSchema.partial();

export type UpdateFeatureParams = z.infer<typeof UpdateFeatureParamsSchema>;
