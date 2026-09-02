import { z } from "zod/v4";
import { UsageAttributionSchema } from "../../cusProductModels/cusEntModels/cusEntModels.js";

export const ExistingUsagesSchema = z.record(
	z.string(),
	z.object({
		usage: z.number(),
		// The slice of `usage` that had already exceeded its allowance on the
		// source, so a more generous destination doesn't erase what was owed.
		accruedOverage: z.number().optional(),
		entityUsages: z.record(z.string(), z.number()),
		usageAttribution: UsageAttributionSchema.optional(),
	}),
);

export type ExistingUsages = z.infer<typeof ExistingUsagesSchema>;
