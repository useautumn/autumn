import { z } from "zod/v4";

export const CarryOverUsagesSchema = z
	.object({
		enabled: z.boolean().meta({
			description: "Whether to carry over usages from the previous plan.",
		}),
		feature_ids: z.array(z.string()).optional().meta({
			description:
				"The IDs of the features to carry over usages for. If left undefined, all consumable features will be carried over.",
		}),
	})
	.optional()
	.meta({
		description: "Whether to carry over usages from the previous plan.",
	});

export type CarryOverUsages = z.infer<typeof CarryOverUsagesSchema>;
