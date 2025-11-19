import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import { defineVersionChange } from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { ApiTrialsUsedV1Schema } from "../apiTrialsUsedV1.js";
import { ApiTrialsUsedV0Schema } from "../prevVersions/apiTrialsUsedV0.js";

/**
 * Transform trials_used from V2.0 format to V1.2 format
 * Exported so it can be reused in other transformations (e.g., V1_2_CustomerChange)
 */
export function transformTrialsUsedToV0({
	input,
}: {
	input: z.infer<typeof ApiTrialsUsedV1Schema>;
}): z.infer<typeof ApiTrialsUsedV0Schema> {
	return {
		product_id: input.plan_id,
		customer_id: input.customer_id,
		fingerprint: input.fingerprint,
	};
}

/**
 * V1_2_TrialsUsedChange: Transforms trials_used response TO V1_2 format
 *
 * Applied when: targetVersion <= V1_2
 *
 * Breaking changes introduced in V2.0:
 *
 * 1. Product renamed to Plan:
 *    - V2.0+: "plan_id" field
 *    - V1.2: "product_id" field
 *
 * Input: ApiTrialsUsedV1 (V2.0+ format)
 * Output: ApiTrialsUsedV0 (V1.2 format)
 */
export const V1_2_TrialsUsedChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Products renamed to plans in SDK",
		"TrialsUsed plan_id renamed to product_id for V1.2 compatibility",
	],
	affectedResources: [],
	newSchema: ApiTrialsUsedV1Schema,
	oldSchema: ApiTrialsUsedV0Schema,

	// Response: V2.0 → V1.2
	transformResponse: transformTrialsUsedToV0,
});
