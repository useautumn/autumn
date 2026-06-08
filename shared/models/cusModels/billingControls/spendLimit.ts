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
				"Windowed usage cap: max units allowed per window. Its presence arms the cap (hard pre-write reject); absent means no usage cap.",
		}),
		usage_limit_interval: z.enum(EntInterval).optional().meta({
			description:
				"Optional window/reset interval for the usage cap, aligned to the customer's billing cycle. When omitted, defaults to the feature entitlement's own reset interval. Only meaningful with usage_limit set.",
		}),
	})
	.refine(
		(data) =>
			!(data.overage_limit !== undefined || data.usage_limit !== undefined) ||
			data.feature_id !== undefined,
		{
			message:
				"feature_id is required when overage_limit or usage_limit is provided",
			path: ["feature_id"],
		},
	);

export type DbSpendLimit = z.infer<typeof DbSpendLimitSchema>;

export const SpendLimitResponseSchema = DbSpendLimitSchema.extend({
	usage_limit_used: z.number().min(0).optional().meta({
		description:
			"Current usage already consumed in the active usage_limit window. Response-only; not stored on billing controls.",
	}),
});

export type SpendLimitResponse = z.infer<typeof SpendLimitResponseSchema>;
