import { z } from "zod/v4";
import {
	UsageAlertBasisSchema,
	UsageAlertThresholdType,
} from "../../../models/cusModels/billingControls/usageAlert.js";
import { UsageLimitFilterSchema } from "../../../models/cusModels/billingControls/usageLimit.js";
import { UsageLimitWebhookBlockSchema } from "./usageLimitWebhookBlock.js";

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
	basis: UsageAlertBasisSchema.meta({
		description:
			"What 100% meant for this alert. usage_limit alerts carry a usage_limit block; every other basis carries a balance block.",
	}),
	filter: UsageLimitFilterSchema.optional().meta({
		description:
			"The usage limit filter this alert points at, when the alert targets a filtered cap.",
	}),
});

export const BalancesUsageAlertBalanceBlockSchema = z.object({
	usage: z.number().meta({
		description: "Units consumed on the feature, after this event.",
	}),
	granted: z.number().meta({
		description: "Every grant on the feature: included, prepaid and rollover.",
	}),
	included: z.number().meta({
		description: "Grants from plan allowances only.",
	}),
	remaining: z.number().meta({
		description: "The alert's denominator minus usage, never below zero.",
	}),
});

export const BALANCES_USAGE_ALERT_TRIGGERED_EXAMPLE = {
	customer_id: "org_123",
	feature_id: "api_calls",
	entity_id: "workspace_abc",
	usage_alert: {
		name: "80% usage warning",
		threshold: 80,
		threshold_type: "usage_percentage",
		basis: "balance",
	},
	balance: { usage: 1600, granted: 2000, included: 2000, remaining: 400 },
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
		balance: BalancesUsageAlertBalanceBlockSchema.optional().meta({
			description:
				"The balance the alert measured. Present unless basis is usage_limit.",
		}),
		usage_limit: UsageLimitWebhookBlockSchema.optional().meta({
			description:
				"The usage limit the alert measured. Present only when basis is usage_limit.",
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
export type BalancesUsageAlertBalanceBlock = z.infer<
	typeof BalancesUsageAlertBalanceBlockSchema
>;
