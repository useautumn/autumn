import type { z } from "zod/v4";
import { isUsageLimitBasisAlert } from "../../models/cusModels/billingControls/classify/isUsageLimitBasisAlert.js";
import { CustomerBillingControlsParamsSchema } from "../../models/cusModels/billingControls/customerBillingControls.js";
import { findUnresolvableUsageLimitAlerts } from "../../utils/billingControlUtils/findUnresolvableUsageLimitAlerts.js";

/**
 * A plan is the only place its own alerts can resolve a cap from, so a
 * usage_limit alert must point at a usage limit on the same plan.
 */
export const PlanBillingControlsParamsSchema =
	CustomerBillingControlsParamsSchema.check((ctx) => {
		const usageAlerts = ctx.value.usage_alerts ?? [];
		if (!usageAlerts.some(isUsageLimitBasisAlert)) return;

		const unresolvable = findUnresolvableUsageLimitAlerts({
			usageAlerts,
			usageLimitLists: [ctx.value.usage_limits ?? []],
		});
		for (const { index, usageAlert } of unresolvable) {
			ctx.issues.push({
				code: "custom",
				message: `No usage limit on this plan matches the usage_limit alert for feature ${usageAlert.feature_id ?? "(any)"}`,
				input: usageAlert,
				path: ["usage_alerts", index, "basis"],
			});
		}
	});

export type PlanBillingControlsParams = z.input<
	typeof PlanBillingControlsParamsSchema
>;
