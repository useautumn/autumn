import { CustomerBillingControlsParamsSchema } from "../../models/cusModels/billingControls/customerBillingControls.js";
import { filterUnresolvableUsageLimitAlerts } from "../../utils/billingControlUtils/filterUnresolvableUsageLimitAlerts.js";

// Create only; updates validate against the merged row server-side.
export const PlanBillingControlsParamsSchema =
	CustomerBillingControlsParamsSchema.check((ctx) => {
		const unresolvable = filterUnresolvableUsageLimitAlerts({
			usageAlerts: ctx.value.usage_alerts ?? [],
			usageLimitLists: [ctx.value.usage_limits ?? []],
		});
		for (const { index, usageAlert } of unresolvable) {
			ctx.issues.push({
				code: "custom",
				message: `No usage limit on this plan matches the usage_limit alert for feature ${usageAlert.feature_id}`,
				input: usageAlert,
				path: ["usage_alerts", index, "basis"],
			});
		}
	});
