import {
	type ApiPlanExpandedV1,
	ApiPlanExpandedV1Schema,
} from "@api/products/apiPlanV1.js";
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
 *
 * Schemas use the expanded plan shape: the transform output is re-parsed with
 * `oldSchema`, and the plain ApiPlanV1Schema would silently strip the plan's
 * `licenses` / `variants` edges from V2.1 responses.
 */
export const V2_1_PlanChanges = defineVersionChange({
	newVersion: ApiVersion.V2_2,
	oldVersion: ApiVersion.V2_1,
	description: [
		"customer_eligibility: added attach_action, status, canceling, trialing",
		"customer_eligibility: scenario kept for V2.1 backward compat",
	],
	affectedResources: [AffectedResource.Product],
	newSchema: ApiPlanExpandedV1Schema,
	oldSchema: ApiPlanExpandedV1Schema,

	affectsRequest: false,
	affectsResponse: true,

	transformResponse: ({
		input,
	}: {
		input: ApiPlanExpandedV1;
	}): ApiPlanExpandedV1 => {
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
