import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { CheckQuerySchema } from "../checkParams.js";
import { CheckExpand } from "../enums/CheckExpand.js";

/**
 * V1_2_CheckQueryChange: Transforms check query TO latest format
 *
 * Applied when: sourceVersion <= V1_2
 *
 * Changes introduced in V2.0:
 *
 * 1. Added new expand option:
 *    - "balance.feature" - expands the full feature object in the balance
 *
 * This transformation automatically adds this expand option when transforming
 * from V1.2 to V2.0, so that V1.2 clients get the full feature object
 * (matching their expected verbose format).
 *
 * Input: Query without balance.feature expand
 * Output: Query with balance.feature automatically expanded
 */

export const V1_2_CheckQueryChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_2,
	description: [
		"Automatically expands balance.feature for V1.2 clients",
		"Ensures V1.2 clients get full feature object in balance",
	],
	affectedResources: [AffectedResource.Check],
	newSchema: CheckQuerySchema,
	oldSchema: CheckQuerySchema,

	// Only transform requests (incoming queries)
	affectsRequest: true,
	affectsResponse: false,

	// Request: V1.2 → V2.0 (add expand option)
	transformRequest: ({
		input,
	}: {
		input: z.infer<typeof CheckQuerySchema>;
	}) => {
		const existingExpand = input.expand || [];

		// Add `balance.feature` to expand array
		const newExpand = [...existingExpand, CheckExpand.BalanceFeature];

		return {
			...input,
			expand: newExpand,
		} satisfies z.infer<typeof CheckQuerySchema>;
	},
});
