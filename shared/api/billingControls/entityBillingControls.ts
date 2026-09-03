import { z } from "zod/v4";
import {
	featureIdIdentity,
	findDuplicateBillingControlIssue,
} from "../../models/cusModels/billingControls/findDuplicateBillingControlIssue.js";
import { DbOverageAllowedSchema } from "../../models/cusModels/billingControls/overageAllowed.js";
import { DbSpendLimitSchema } from "../../models/cusModels/billingControls/spendLimit.js";
import { DbUsageAlertSchema } from "../../models/cusModels/billingControls/usageAlert.js";
import { usageAlertIdentity } from "../../models/cusModels/billingControls/usageAlertIdentity.js";
import {
	DbUsageLimitSchema,
	usageLimitIdentity,
} from "../../models/cusModels/billingControls/usageLimit.js";
import { ApiOverageAllowedSchema } from "./overageAllowed.js";
import { ApiSpendLimitSchema } from "./spendLimit.js";
import { ApiUsageAlertSchema } from "./usageAlert.js";
import { ApiUsageLimitSchema } from "./usageLimit.js";

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
	ApiEntityBillingControlsParamsBaseSchema.check((ctx) => {
		const billingControls = ctx.value;
		const issue =
			findDuplicateBillingControlIssue({
				controlKey: "spend_limits",
				controls: billingControls.spend_limits,
				identityOf: featureIdIdentity,
				field: "feature_id",
				message: "Only one spend limit entry is allowed per feature_id",
			}) ??
			findDuplicateBillingControlIssue({
				controlKey: "usage_limits",
				controls: billingControls.usage_limits,
				identityOf: usageLimitIdentity,
				field: "feature_id",
				message:
					"Only one usage limit entry is allowed per feature_id and filter",
			}) ??
			findDuplicateBillingControlIssue({
				controlKey: "usage_alerts",
				controls: billingControls.usage_alerts,
				identityOf: usageAlertIdentity,
				field: "threshold",
				message:
					"Only one usage alert entry is allowed per feature_id, basis, filter, threshold_type and threshold",
			}) ??
			findDuplicateBillingControlIssue({
				controlKey: "overage_allowed",
				controls: billingControls.overage_allowed,
				identityOf: featureIdIdentity,
				field: "feature_id",
				message: "Only one overage_allowed entry is allowed per feature_id",
			});
		if (issue) ctx.issues.push(issue);
	});

export type ApiEntityBillingControls = z.infer<
	typeof ApiEntityBillingControlsSchema
>;
export type ApiEntityBillingControlsParams = z.input<
	typeof ApiEntityBillingControlsParamsSchema
>;
