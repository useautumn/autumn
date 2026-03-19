import { z } from "zod/v4";
import { UsageAlertThresholdType } from "../billingControls/usageAlert.js";

export const BalancesThresholdType = z.enum([
	"usage_alert",
	"allowance_used",
	"limit_reached",
]);

export const BalancesThresholdReachedUsageAlertSchema = z.object({
	name: z.string().optional().meta({
		description: "User-defined label for the alert, if provided.",
	}),
	threshold: z.number().meta({
		description: "The threshold value that was crossed.",
	}),
	threshold_type: UsageAlertThresholdType.meta({
		description:
			"Whether the threshold is an absolute usage count or a percentage.",
	}),
	current_usage: z.number().meta({
		description: "The customer's usage at the time the alert was triggered.",
	}),
	current_balance: z.number().meta({
		description: "The customer's balance at the time the alert was triggered.",
	}),
});

export const BalancesThresholdReachedSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer whose threshold was reached.",
	}),
	feature_id: z.string().meta({
		description: "The feature ID the threshold applies to.",
	}),
	threshold_type: BalancesThresholdType.meta({
		description: "The type of threshold that was reached.",
	}),
	usage_alert: BalancesThresholdReachedUsageAlertSchema.optional().meta({
		description:
			"Details of the usage alert that was triggered. Present when threshold_type is usage_alert.",
	}),
});

export type BalancesThresholdReached = z.infer<
	typeof BalancesThresholdReachedSchema
>;
export type BalancesThresholdReachedUsageAlert = z.infer<
	typeof BalancesThresholdReachedUsageAlertSchema
>;
