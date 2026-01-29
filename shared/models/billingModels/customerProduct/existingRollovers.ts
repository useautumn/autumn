import { RolloverSchema } from "@models/cusProductModels/cusEntModels/rolloverModels/rolloverTable";
import { z } from "zod/v4";

export const ExistingRolloverSchema = RolloverSchema.extend({
	internal_feature_id: z.string(),
});

export type ExistingRollover = z.infer<typeof ExistingRolloverSchema>;
