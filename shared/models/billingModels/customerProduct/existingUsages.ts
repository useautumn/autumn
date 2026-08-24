import { z } from "zod/v4";
import { UsageAttributionSchema } from "../../cusProductModels/cusEntModels/cusEntModels.js";

export const ExistingUsagesSchema = z.record(
	z.string(),
	z.object({
		usage: z.number(),
		entityUsages: z.record(z.string(), z.number()),
		usageAttribution: UsageAttributionSchema.optional(),
	}),
);

export type ExistingUsages = z.infer<typeof ExistingUsagesSchema>;
