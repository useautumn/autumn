import { z } from "zod/v4";
import { DbSpendLimitSchema } from "./spendLimit.js";
import { DbUsageAlertSchema } from "./usageAlert.js";

export const EntityBillingControlsSchema = z.object({
	spend_limits: z.array(DbSpendLimitSchema).optional().meta({
		description: "List of overage spend limits per feature.",
	}),
	usage_alerts: z.array(DbUsageAlertSchema).optional().meta({
		description: "List of usage alert configurations per feature.",
	}),
});

export type EntityBillingControls = z.infer<typeof EntityBillingControlsSchema>;
export type EntityBillingControlsParams = z.input<
	typeof EntityBillingControlsSchema
>;
