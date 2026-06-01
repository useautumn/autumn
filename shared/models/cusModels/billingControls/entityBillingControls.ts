import { z } from "zod/v4";
import { DbOverageAllowedSchema } from "./overageAllowed.js";
import { DbSpendLimitSchema } from "./spendLimit.js";
import { DbUsageAlertSchema } from "./usageAlert.js";
import { DbUsageLimitSchema } from "./usageLimit.js";

export const EntityBillingControlsSchema = z.object({
	spend_limits: z.array(DbSpendLimitSchema).optional().meta({
		description: "List of overage spend limits per feature.",
	}),
	usage_limits: z.array(DbUsageLimitSchema).optional().meta({
		description: "List of windowed usage-limit caps per feature.",
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
