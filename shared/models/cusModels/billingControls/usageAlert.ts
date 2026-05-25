import { z } from "zod/v4";

export const UsageAlertThresholdType = z.enum([
	"usage",
	"usage_percentage",
	"remaining",
	"remaining_percentage",
]);

export const DbUsageAlertSchema = z
	.object({
		feature_id: z.string().optional().meta({
			description: "The feature ID this alert applies to.",
		}),
		enabled: z.boolean().default(true).meta({
			description: "Whether this usage alert is enabled.",
		}),
		threshold: z.number().min(0).meta({
			description:
				"The threshold value that triggers the alert. For usage or remaining, this is an absolute count. For usage_percentage or remaining_percentage, this is a percentage (0-100).",
		}),
		threshold_type: UsageAlertThresholdType.meta({
			description:
				"Whether the threshold is an absolute count or a percentage of the usage allowance or remaining balance.",
		}),
		name: z.string().optional().meta({
			description:
				"Optional user-defined label to distinguish multiple alerts on the same feature.",
		}),
	})
	.check((ctx) => {
		const { threshold_type, threshold } = ctx.value;

		// remaining_percentage is bounded by granted, so > 100 has no sensible
		// firing semantics. usage_percentage can legitimately exceed 100 when a
		// customer is over their allowance (e.g. alert at 200% or 300% usage).
		if (threshold_type === "remaining_percentage" && threshold > 100) {
			ctx.issues.push({
				code: "custom",
				input: threshold,
				path: ["threshold"],
				message: "Threshold must be between 0 and 100 for remaining_percentage",
			});
		}
	});

export type DbUsageAlert = z.infer<typeof DbUsageAlertSchema>;
