import { z } from "zod/v4";
import { UsageLimitFilterSchema } from "./usageLimit.js";

export const UsageAlertThresholdType = z.enum([
	"usage",
	"usage_percentage",
	"remaining",
	"remaining_percentage",
]);

export const USAGE_ALERT_BASES = [
	"balance",
	"included",
	"recurring",
	"usage_limit",
] as const;

export const UsageAlertBasisSchema = z.enum(USAGE_ALERT_BASES);
export type UsageAlertBasis = z.infer<typeof UsageAlertBasisSchema>;

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
		basis: UsageAlertBasisSchema.default("balance").meta({
			description:
				"What 100% means. balance: every grant on the feature. included: the plan allowance only. recurring: grants that reset. usage_limit: the cap of the usage limit with the same feature and filter.",
		}),
		filter: UsageLimitFilterSchema.optional().meta({
			description:
				"Only valid with basis usage_limit. Points the alert at the usage limit carrying the same filter.",
		}),
		name: z.string().optional().meta({
			description:
				"Optional user-defined label to distinguish multiple alerts on the same feature.",
		}),
	})
	.check((ctx) => {
		const { threshold_type, threshold, basis, filter } = ctx.value;

		// remaining_percentage is bounded by the denominator, so > 100 can never fire.
		if (threshold_type === "remaining_percentage" && threshold > 100) {
			ctx.issues.push({
				code: "custom",
				input: threshold,
				path: ["threshold"],
				message: "Threshold must be between 0 and 100 for remaining_percentage",
			});
		}

		if (filter && basis !== "usage_limit") {
			ctx.issues.push({
				code: "custom",
				input: filter,
				path: ["filter"],
				message: "filter is only valid when basis is usage_limit",
			});
		}
	});

export type DbUsageAlert = z.infer<typeof DbUsageAlertSchema>;
export type DbUsageAlertParams = z.input<typeof DbUsageAlertSchema>;
export type DbUsageAlertLike = DbUsageAlert | DbUsageAlertParams;
