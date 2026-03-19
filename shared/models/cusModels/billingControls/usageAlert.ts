import { z } from "zod/v4";

export const UsageAlertThresholdType = z.enum(["usage", "balance"]);

export const DbUsageAlertSchema = z.object({
	feature_id: z.string().optional().meta({
		description: "The feature id this alert applies to. If not included, the alert applies globally.",
	}),
	enabled: z.boolean().default(true).meta({
		description: "Whether this usage alert is enabled.",
	}),
	threshold: z.number().min(0).meta({
		description: "The threshold value that triggers the alert.",
	}),
	threshold_type: UsageAlertThresholdType.meta({
		description:
			'Whether the threshold is based on, can be usage or balance.',
	}),
	name: z.string().optional().meta({
		description:
			"Optional user-defined label to name an alerts.",
	}),
});

export type DbUsageAlert = z.infer<typeof DbUsageAlertSchema>;
