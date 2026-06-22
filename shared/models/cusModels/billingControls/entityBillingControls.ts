import { z } from "zod/v4";
import { DbOverageAllowedSchema } from "./overageAllowed.js";
import { DbSpendLimitSchema } from "./spendLimit.js";
import { DbUsageAlertSchema } from "./usageAlert.js";
import { DbUsageLimitSchema } from "./usageLimit.js";

export const EntityBillingControlsSchema = z.object({
	spend_limits: z.array(DbSpendLimitSchema).optional().meta({
		description:
			"List of spend limits per feature. Each entry caps overage (overage_limit) and/or per-interval usage (usage_limit).",
	}),
	usage_limits: z.array(DbUsageLimitSchema).optional().meta({
		description:
			"List of hard usage caps per feature for this entity (max units per interval). An entity entry overrides the customer's for that feature.",
	}),
	usage_alerts: z.array(DbUsageAlertSchema).optional().meta({
		description: "List of usage alert configurations per feature.",
	}),
	overage_allowed: z.array(DbOverageAllowedSchema).optional().meta({
		description:
			"List of overage allowed controls per feature. When enabled, usage can exceed balance.",
	}),
});

export type EntityBillingControls = z.infer<typeof EntityBillingControlsSchema>;
export type EntityBillingControlsParams = z.input<
	typeof EntityBillingControlsSchema
>;
