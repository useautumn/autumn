import { z } from "zod/v4";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";

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
		usage_limit: z.number().min(0).optional().meta({
			description:
				"Optional override for the windowed usage cap. When omitted, the cap inherits the feature entitlement's usage_limit. Only meaningful with usage_limit_interval set.",
		}),
		usage_limit_interval: z.enum(EntInterval).optional().meta({
			description:
				"Interval the windowed usage cap resets on, aligned to the customer's billing cycle. Its presence arms the usage cap (hard pre-write reject); absent means no usage cap.",
		}),
	})
	.refine(
		(data) =>
			!(
				data.overage_limit !== undefined ||
				data.usage_limit_interval !== undefined
			) || data.feature_id !== undefined,
		{
			message:
				"feature_id is required when overage_limit or usage_limit_interval is provided",
			path: ["feature_id"],
		},
	);

export type DbSpendLimit = z.infer<typeof DbSpendLimitSchema>;
