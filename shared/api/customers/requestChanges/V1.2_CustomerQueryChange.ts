import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { CustomerExpand } from "../components/customerExpand/customerExpand.js";
import { GetCustomerQuerySchema } from "../customerOpModels.js";

/**
 * V1_2_CustomerQueryChange: Transforms customer query TO latest format
 *
 * Applied when: sourceVersion <= V1_2
 *
 * Changes introduced in V2.0:
 *
 * 1. Added new expand options:
 *    - "plans.plan" - expands the full plan object in each customer plan
 *    - "features.feature" - expands the full feature object in each customer feature
 *
 * This transformation automatically adds these expand options when transforming
 * from V1.2 to V2.0, so that V1.2 clients get the full plan/feature objects
 * (matching their expected verbose format).
 *
 * Input: Query without plans.plan/features.feature expand
 * Output: Query with plans.plan and features.feature automatically expanded
 */

export const V1_2_CustomerQueryChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Automatically expands plans.plan and features.feature for V1.2 clients",
		"Ensures V1.2 clients get full plan/feature objects",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: GetCustomerQuerySchema,
	oldSchema: GetCustomerQuerySchema,

	// Only transform requests (incoming queries)
	affectsRequest: true,
	affectsResponse: false,

	// Request: V1.2 → V2.0 (add expand options)
	transformRequest: ({
		input,
	}: {
		input: z.infer<typeof GetCustomerQuerySchema>;
	}) => {
		const existingExpand = input.expand || [];

		// Add `plan` and `feature` to expand array
		const newExpand = [
			...existingExpand,
			CustomerExpand.SubscriptionsPlan,
			CustomerExpand.PurchasesPlan,
			CustomerExpand.BalancesFeature,
		];

		return {
			...input,
			expand: newExpand,
		} satisfies z.infer<typeof GetCustomerQuerySchema>;
	},
});
