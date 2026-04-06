import { z } from "zod/v4";

export const UsageAlertThresholdType = z.enum(["usage", "usage_percentage"]);

export const DbUsageAlertSchema = z
	.object({
		feature_id: z.string().optional().meta({
			description:
				"The feature ID this alert applies to.",
		}),
		enabled: z.boolean().default(true).meta({
			description: "Whether this usage alert is enabled.",
		}),
		threshold: z.number().min(0).meta({
			description:
				"The threshold value that triggers the alert. For usage, this is an absolute count. For usage_percentage, this is a percentage (0-100).",
		}),
		threshold_type: UsageAlertThresholdType.meta({
			description:
				"Whether the threshold is an absolute usage count or a percentage of the usage allowance.",
		}),
		name: z.string().optional().meta({
			description:
				"Optional user-defined label to distinguish multiple alerts on the same feature.",
		}),
	})
	.check((ctx) => {
		const { threshold_type, threshold } = ctx.value;

		if (threshold_type === "usage_percentage" && threshold > 100) {
			ctx.issues.push({
				code: "custom",
				input: threshold,
				path: ["threshold"],
				message: "Threshold must be between 0 and 100 for usage_percentage",
			});
		}
	});

export type DbUsageAlert = z.infer<typeof DbUsageAlertSchema>;
