import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { FeatureType } from "@models/featureModels/featureEnums.js";
import type { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../apiFeatureV1.js";
import {
	ApiFeatureType,
	ApiFeatureV0Schema,
} from "../prevVersions/apiFeatureV0.js";

/**
 * V1_2_FeatureChange: Transforms feature response between V1 and V0
 *
 * Applied when: targetVersion <= V1_Beta
 *
 * Breaking changes introduced in V2.0:
 *
 * 1. Type enum changes:
 *    - V1: Uses FeatureType (boolean, metered, credit_system)
 *    - V0: Uses ApiFeatureType (static, boolean, single_use, continuous_use, credit_system)
 *
 * 2. Fields in V1 not in V0:
 *    - `consumable`: Boolean flag for metered features
 *    - `event_names`: Optional array of event names
 *
 * 3. Type mapping (V1 → V0):
 *    - boolean → boolean
 *    - credit_system → credit_system
 *    - metered (consumable: true) → single_use
 *    - metered (consumable: false) → continuous_use
 *
 * Input: ApiFeatureV1 (V2.0+ format)
 * Output: ApiFeatureV0 (V1.2 format)
 */

export const V1_2_FeatureChange = defineVersionChange({
	name: "V1_2 Feature Change",
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Feature type enum changed from FeatureType to ApiFeatureType",
		"Removed consumable and event_names fields",
	],
	affectedResources: [AffectedResource.Feature],
	newSchema: ApiFeatureV1Schema,
	oldSchema: ApiFeatureV0Schema,
	affectsResponse: true,
	affectsRequest: false,

	// Response: V1 → V0 (new format to old)
	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof ApiFeatureV1Schema>;
	}): z.infer<typeof ApiFeatureV0Schema> => {
		// Map V1 type to V0 type
		let v0Type: ApiFeatureType;

		if (input.type === FeatureType.Boolean) {
			v0Type = ApiFeatureType.Boolean;
		} else if (input.type === FeatureType.CreditSystem) {
			v0Type = ApiFeatureType.CreditSystem;
		} else if (input.type === FeatureType.Metered) {
			// Use consumable flag to determine single_use vs continuous_use
			v0Type = input.consumable
				? ApiFeatureType.SingleUsage
				: ApiFeatureType.ContinuousUse;
		} else {
			// Fallback (should never happen)
			v0Type = ApiFeatureType.Boolean;
		}

		return {
			id: input.id,
			name: input.name,
			type: v0Type,
			display: input.display
				? {
						singular: input.display.singular || "",
						plural: input.display.plural || "",
					}
				: null,
			credit_schema: input.credit_schema || null,
			archived: input.archived,
		} satisfies z.infer<typeof ApiFeatureV0Schema>;
	},
});
