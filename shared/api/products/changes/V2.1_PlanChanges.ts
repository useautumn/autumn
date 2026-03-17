import { type ApiPlanV1, ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";

/**
 * V2.1_PlanChanges: Transforms plan response TO V2.1 format
 *
 * Breaking changes introduced in V2.2:
 * - customer_eligibility gained new fields: attach_action, status, canceling, trialing
 * - customer_eligibility.scenario removed from public response (internal only)
 *
 * For V2.1 clients, we strip the new fields and restore scenario.
 */
export const V2_1_PlanChanges = defineVersionChange({
	newVersion: ApiVersion.V2_2,
	oldVersion: ApiVersion.V2_1,
	description: [
		"customer_eligibility: added attach_action, status, canceling, trialing",
		"customer_eligibility: scenario kept for V2.1 backward compat",
	],
	affectedResources: [AffectedResource.Product],
	newSchema: ApiPlanV1Schema,
	oldSchema: ApiPlanV1Schema,

	affectsRequest: false,
	affectsResponse: true,

	transformResponse: ({ input }: { input: ApiPlanV1 }): ApiPlanV1 => {
		if (!input.customer_eligibility) return input;

		return {
			...input,
			customer_eligibility: {
				// object: "customer_eligibility" as const,
				trial_available: input.customer_eligibility.trial_available,
				scenario: input.customer_eligibility.scenario,
				attach_action: input.customer_eligibility.attach_action,
				status: undefined,
				canceling: undefined,
				trialing: undefined,
			},
		};
	},
});
