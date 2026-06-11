import { z } from "zod/v4";

export const DbSpendLimitSchema = z
	.object({
		feature_id: z.string().optional().meta({
			description: "Optional feature ID this spend limit applies to.",
		}),
		enabled: z.boolean().default(false).meta({
			description: "Whether the overage spend limit is enabled.",
		}),
		overage_limit: z.number().min(0).optional().meta({
			description: "Maximum allowed overage spend for the target feature.",
		}),
	})
	.refine(
		(data) => data.overage_limit === undefined || data.feature_id !== undefined,
		{
			message: "feature_id is required when overage_limit is provided",
			path: ["feature_id"],
		},
	);

export type DbSpendLimit = z.infer<typeof DbSpendLimitSchema>;
