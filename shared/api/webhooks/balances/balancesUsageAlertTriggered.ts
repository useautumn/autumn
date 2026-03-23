import { z } from "zod/v4";
import { UsageAlertThresholdType } from "../../billingControls/usageAlert.js";

export const BalancesUsageAlertTriggeredAlertSchema = z.object({
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
});

export const BALANCES_USAGE_ALERT_TRIGGERED_EXAMPLE = {
	customer_id: "org_123",
	feature_id: "api_calls",
	entity_id: "workspace_abc",
	usage_alert: {
		name: "80% usage warning",
		threshold: 80,
		threshold_type: "usage_percentage_threshold",
	},
};

export const BalancesUsageAlertTriggeredSchema = z
	.object({
		customer_id: z.string().meta({
			description: "The ID of the customer whose usage alert was triggered.",
		}),
		feature_id: z.string().meta({
			description: "The feature ID the alert applies to.",
		}),
		entity_id: z.string().optional().meta({
			description:
				"The entity ID the alert applies to, if the usage was entity-scoped.",
		}),
		usage_alert: BalancesUsageAlertTriggeredAlertSchema.meta({
			description: "Details of the usage alert that was triggered.",
		}),
	})
	.meta({
		examples: [BALANCES_USAGE_ALERT_TRIGGERED_EXAMPLE],
	});

export type BalancesUsageAlertTriggered = z.infer<
	typeof BalancesUsageAlertTriggeredSchema
>;
export type BalancesUsageAlertTriggeredAlert = z.infer<
	typeof BalancesUsageAlertTriggeredAlertSchema
>;
