import { z } from "zod/v4";
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
		const spendLimitFeatureIds = new Set<string>();

		for (const [index, spendLimit] of (
			billingControls.spend_limits ?? []
		).entries()) {
			if (!spendLimit.feature_id) {
				continue;
			}

			if (spendLimitFeatureIds.has(spendLimit.feature_id)) {
				ctx.issues.push({
					code: "custom",
					message: "Only one spend limit entry is allowed per feature_id",
					input: spendLimit.feature_id,
					path: ["spend_limits", index, "feature_id"],
				});
				return;
			}

			spendLimitFeatureIds.add(spendLimit.feature_id);
		}

		const usageLimitIdentities = new Set<string>();

		for (const [index, usageLimit] of (
			billingControls.usage_limits ?? []
		).entries()) {
			const identity = usageLimitIdentity(usageLimit);
			if (usageLimitIdentities.has(identity)) {
				ctx.issues.push({
					code: "custom",
					message:
						"Only one usage limit entry is allowed per feature_id and filter",
					input: usageLimit.feature_id,
					path: ["usage_limits", index, "feature_id"],
				});
				return;
			}

			usageLimitIdentities.add(identity);
		}

		const usageAlertIdentities = new Set<string>();

		for (const [index, usageAlert] of (
			billingControls.usage_alerts ?? []
		).entries()) {
			const identity = usageAlertIdentity(usageAlert);
			if (usageAlertIdentities.has(identity)) {
				ctx.issues.push({
					code: "custom",
					message:
						"Only one usage alert entry is allowed per feature_id, basis, filter, threshold_type and threshold",
					input: usageAlert.threshold,
					path: ["usage_alerts", index, "threshold"],
				});
				return;
			}

			usageAlertIdentities.add(identity);
		}

		const overageAllowedFeatureIds = new Set<string>();

		for (const [index, overageAllowed] of (
			billingControls.overage_allowed ?? []
		).entries()) {
			if (overageAllowedFeatureIds.has(overageAllowed.feature_id)) {
				ctx.issues.push({
					code: "custom",
					message: "Only one overage_allowed entry is allowed per feature_id",
					input: overageAllowed.feature_id,
					path: ["overage_allowed", index, "feature_id"],
				});
				return;
			}

			overageAllowedFeatureIds.add(overageAllowed.feature_id);
		}
	});

export type ApiEntityBillingControls = z.infer<
	typeof ApiEntityBillingControlsSchema
>;
export type ApiEntityBillingControlsParams = z.input<
	typeof ApiEntityBillingControlsParamsSchema
>;
