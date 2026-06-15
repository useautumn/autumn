import { z } from "zod/v4";
import {
	AutoTopupResponseSchema,
	DbOverageAllowedSchema,
	DbUsageAlertSchema,
} from "../../models/cusModels/billingControls/customerBillingControls.js";
import { ApiSpendLimitSchema } from "./spendLimit.js";
import { ApiUsageLimitSchema } from "./usageLimit.js";

/**
 * Response-only variant of CustomerBillingControlsSchema: `auto_topups` may
 * carry the expanded runtime purchase-limit shape, and `usage_limits` carry
 * the current window `usage`. Input/params validation continues to use
 * `CustomerBillingControlsParamsSchema` (models), which remains strict.
 */
export const CustomerBillingControlsResponseSchema = z.object({
	auto_topups: z.array(AutoTopupResponseSchema).optional().meta({
		description: "List of auto top-up configurations per feature.",
	}),
	spend_limits: z.array(ApiSpendLimitSchema).optional().meta({
		description:
			"List of overage spend limits per feature (caps overage spend).",
	}),
	usage_limits: z.array(ApiUsageLimitSchema).optional().meta({
		description:
			"List of hard usage caps per feature, with current interval usage.",
	}),
	usage_alerts: z.array(DbUsageAlertSchema).optional().meta({
		description: "List of usage alert configurations per feature.",
	}),
	overage_allowed: z.array(DbOverageAllowedSchema).optional().meta({
		description:
			"List of overage allowed controls per feature. When enabled, usage can exceed balance.",
	}),
});

export type CustomerBillingControlsResponse = z.infer<
	typeof CustomerBillingControlsResponseSchema
>;
