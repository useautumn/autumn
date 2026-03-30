import { z } from "zod/v4";
import { ApiOverageAllowedSchema } from "./overageAllowed.js";
import { ApiSpendLimitSchema } from "./spendLimit.js";
import { ApiUsageAlertSchema } from "./usageAlert.js";

export const ApiEntityBillingControlsSchema = z.object({
	spend_limits: z.array(ApiSpendLimitSchema).optional().meta({
		description: "List of overage spend limits per feature.",
	}),
	usage_alerts: z.array(ApiUsageAlertSchema).optional().meta({
		description: "List of usage alert configurations per feature.",
	}),
	overage_allowed: z.array(ApiOverageAllowedSchema).optional().meta({
		description:
			"List of overage allowed controls per feature. When enabled, usage can exceed balance.",
	}),
});

export const ApiEntityBillingControlsParamsSchema =
	ApiEntityBillingControlsSchema.check((ctx) => {
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
