import { z } from "zod/v4";

export const DbUsageAlertSchema = z
	.object({
		feature_id: z.string().optional().meta({
			description:
				"The feature ID this alert applies to. If omitted, the alert applies globally.",
		}),
		enabled: z.boolean().default(true).meta({
			description: "Whether this usage alert is enabled.",
		}),
		usage_threshold: z.number().min(0).optional().meta({
			description:
				"Absolute usage count that triggers the alert.",
		}),
		usage_percentage_threshold: z.number().min(0).max(100).optional().meta({
			description:
				"Percentage of the usage allowance (0-100) that triggers the alert.",
		}),
		name: z.string().optional().meta({
			description:
				"Optional user-defined label to distinguish multiple alerts on the same feature.",
		}),
	})
	.check((ctx) => {
		const { usage_threshold, usage_percentage_threshold } = ctx.value;
		const hasUsage = usage_threshold !== undefined;
		const hasPercentage = usage_percentage_threshold !== undefined;

		if (!hasUsage && !hasPercentage) {
			ctx.issues.push({
				code: "custom",
				input: ctx.value,
				message:
					"At least one of usage_threshold or usage_percentage_threshold must be provided",
			});
			return;
		}

		if (hasUsage && hasPercentage) {
			ctx.issues.push({
				code: "custom",
				input: ctx.value,
				message:
					"Only one of usage_threshold or usage_percentage_threshold can be provided, not both",
			});
		}
	});

export type DbUsageAlert = z.infer<typeof DbUsageAlertSchema>;
