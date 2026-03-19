import { z } from "zod/v4";

export const UsageAlertThresholdType = z.enum([
	"usage_threshold",
	"usage_percentage_threshold",
]);

export const DbUsageAlertSchema = z.object({
	feature_id: z.string().optional().meta({
		description:
			"The feature ID this alert applies to. If omitted, the alert applies globally.",
	}),
	enabled: z.boolean().default(true).meta({
		description: "Whether this usage alert is enabled.",
	}),
	threshold: z.number().min(0).meta({
		description:
			"The threshold value that triggers the alert. For usage_threshold, this is an absolute count. For usage_percentage_threshold, this is a percentage (0-100).",
	}),
	threshold_type: UsageAlertThresholdType.meta({
		description:
			"Whether the threshold is an absolute usage count or a percentage of the usage allowance.",
	}),
	name: z.string().optional().meta({
		description:
			"Optional user-defined label to distinguish multiple alerts on the same feature.",
	}),
});

export type DbUsageAlert = z.infer<typeof DbUsageAlertSchema>;
