import { z } from "zod/v4";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";

// Optional windowed usage cap on a spend limit: a hard pre-write reject on units
// consumed per `interval` window, independent of `overage_limit` and of balance.
export const SpendLimitUsageWindowSchema = z.object({
	interval: z.enum(EntInterval).meta({
		description: "The window interval the usage cap resets on.",
	}),
	limit: z.number().min(0).meta({
		description:
			"Maximum units consumable within each window. Feature units for a metered feature, or pool credits for a credit-system feature. Distinct from overage_limit's currency unit.",
	}),
	enabled: z.boolean().default(false).meta({
		description:
			"Whether the windowed usage cap is enforced. Independent of the entry-level `enabled`, which gates the overage cap.",
	}),
});

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
		usage_window: SpendLimitUsageWindowSchema.optional().meta({
			description:
				"Optional windowed usage cap (hard pre-write reject), independent of the overage cap. Absent means no usage cap.",
		}),
	})
	.refine(
		(data) =>
			!(data.overage_limit !== undefined || data.usage_window !== undefined) ||
			data.feature_id !== undefined,
		{
			message:
				"feature_id is required when overage_limit or usage_window is provided",
			path: ["feature_id"],
		},
	);

export type SpendLimitUsageWindow = z.infer<typeof SpendLimitUsageWindowSchema>;
export type DbSpendLimit = z.infer<typeof DbSpendLimitSchema>;
