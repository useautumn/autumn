import { z } from "zod/v4";
import { rejectDuplicateBillingControls } from "../../models/cusModels/billingControls/duplicates/rejectDuplicateBillingControls.js";
import { DbOverageAllowedSchema } from "../../models/cusModels/billingControls/overageAllowed.js";
import { DbSpendLimitSchema } from "../../models/cusModels/billingControls/spendLimit.js";
import { DbUsageAlertSchema } from "../../models/cusModels/billingControls/usageAlert.js";
import { DbUsageLimitSchema } from "../../models/cusModels/billingControls/usageLimit.js";
import { ApiOverageAllowedSchema } from "./overageAllowed.js";
import { ApiSpendLimitSchema } from "./spendLimit.js";
import { ApiUsageAlertSchema } from "./usageAlert.js";
import { ApiUsageLimitSchema, WritableUsageLimitsShape } from "./usageLimit.js";

export const ApiEntityBillingControlsSchema = z.object({
	spend_limits: z.array(ApiSpendLimitSchema).optional().meta({
		description:
			"List of spend limits per feature. Each entry caps overage (overage_limit) and/or per-interval usage (usage_limit).",
	}),
	usage_limits: z.array(ApiUsageLimitSchema).optional().meta({
		description:
			"List of hard usage caps per feature for this entity. An entity entry overrides the customer's for that feature.",
	}),
	usage_alerts: z.array(ApiUsageAlertSchema).optional().meta({
		description: "List of usage alert configurations per feature.",
	}),
	overage_allowed: z.array(ApiOverageAllowedSchema).optional().meta({
		description:
			"List of overage allowed controls per feature. When enabled, usage can exceed balance.",
	}),
});

const ApiEntityBillingControlsParamsBaseSchema = z.object({
	spend_limits: z.array(DbSpendLimitSchema).optional().meta({
		description:
			"List of spend limits per feature. Each entry caps overage (overage_limit) and/or per-interval usage (usage_limit).",
	}),
	usage_limits: z.array(DbUsageLimitSchema).optional().meta({
		description:
			"List of hard usage caps per feature for this entity. An entity entry overrides the customer's for that feature.",
	}),
	usage_alerts: z.array(DbUsageAlertSchema).optional().meta({
		description: "List of usage alert configurations per feature.",
	}),
	overage_allowed: z.array(DbOverageAllowedSchema).optional().meta({
		description:
			"List of overage allowed controls per feature. When enabled, usage can exceed balance.",
	}),
});

export const ApiEntityBillingControlsParamsSchema =
	ApiEntityBillingControlsParamsBaseSchema.check(
		rejectDuplicateBillingControls,
	);

/** Update-request variant: usage limits may also be counter-only writes. */
export const ApiEntityBillingControlsUpdateSchema =
	ApiEntityBillingControlsParamsBaseSchema.extend(
		WritableUsageLimitsShape,
	).check(rejectDuplicateBillingControls);

export type ApiEntityBillingControls = z.infer<
	typeof ApiEntityBillingControlsSchema
>;
export type ApiEntityBillingControlsParams = z.input<
	typeof ApiEntityBillingControlsParamsSchema
>;
