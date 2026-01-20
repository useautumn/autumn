import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { ApiSubscriptionV1Schema } from "../apiSubscriptionV1.js";
import { ApiSubscriptionV0Schema } from "../previousVersions/apiSubscriptionV0.js";

/**
 * Transform subscription from V2.1 format to V2.0 format
 * Exported so it can be reused in other transformations (e.g., CustomerChange, EntityChange)
 */
export function transformSubscriptionV1ToV0({
	input,
}: {
	input: z.infer<typeof ApiSubscriptionV1Schema>;
}): z.infer<typeof ApiSubscriptionV0Schema> {
	const { auto_enable, ...rest } = input;
	return {
		...rest,
		default: auto_enable,
	};
}

/**
 * V2_0_SubscriptionChange: Transforms subscription response TO V2.0 format
 *
 * Applied when: targetVersion <= V2.0
 *
 * Breaking changes introduced in V2.1:
 * - Renamed "default" to "auto_enable"
 *
 * Input: ApiSubscriptionV1 (V2.1+ format with "auto_enable" field)
 * Output: ApiSubscriptionV0 (V2.0 format with "default" field)
 *
 * NOTE: This change is NOT registered in the registry - it's called by parent
 * transforms (CustomerChange, EntityChange). Export the transformSubscriptionV1ToV0
 * function so parents can call it.
 */
export const V2_0_SubscriptionChange = defineVersionChange({
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: "Renamed 'auto_enable' back to 'default'",
	affectedResources: [AffectedResource.CusProduct],
	newSchema: ApiSubscriptionV1Schema,
	oldSchema: ApiSubscriptionV0Schema,
	transformResponse: ({ input }) => transformSubscriptionV1ToV0({ input }),
});
