import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import type { BillingControlSource } from "../../billingControls/billingControlSource.js";
import { ApiCustomerV5Schema } from "../apiCustomerV5";

/** Restores the pre-2.3 view: customer-level entries only, no `source`. */
const stripPlanInherited = <T extends { source?: BillingControlSource }>(
	entries: T[] | undefined,
): Omit<T, "source">[] | undefined => {
	if (entries === undefined) return undefined;
	const customerEntries = entries
		.filter((entry) => entry.source !== "plan")
		.map(({ source: _source, ...rest }) => rest);
	// Plan-only lists read as absent pre-2.3; a stored empty list stays [].
	if (customerEntries.length === 0 && entries.length > 0) return undefined;
	return customerEntries;
};

export const V2_2_PlanInheritedBillingControls = defineVersionChange({
	name: "V2_2 Plan Inherited Billing Controls",
	newVersion: ApiVersion.V2_3,
	oldVersion: ApiVersion.V2_2,
	description: [
		"2.3.0 merges plan-default billing controls into the customer's billing_controls with a `source` tag; older versions receive customer-level entries only, without `source`",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCustomerV5Schema,
	oldSchema: ApiCustomerV5Schema,
	affectsResponse: true,

	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof ApiCustomerV5Schema>;
	}): z.infer<typeof ApiCustomerV5Schema> => {
		const billingControls = input.billing_controls;
		if (!billingControls) return input;

		return {
			...input,
			billing_controls: {
				auto_topups: stripPlanInherited(billingControls.auto_topups),
				spend_limits: stripPlanInherited(billingControls.spend_limits),
				usage_limits: stripPlanInherited(billingControls.usage_limits),
				usage_alerts: stripPlanInherited(billingControls.usage_alerts),
				overage_allowed: stripPlanInherited(billingControls.overage_allowed),
			},
		};
	},
});
