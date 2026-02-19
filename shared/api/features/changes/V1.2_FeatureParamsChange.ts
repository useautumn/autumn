import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../types/sharedContext.js";
import { featureV0ToV1Type } from "../../../utils/featureUtils/convertFeatureUtils.js";
import { CreateFeatureV1ParamsSchema } from "../crud/createFeatureParams.js";
import { CreateFeatureV0ParamsSchema } from "../prevVersions/featureV0OpModels.js";

/**
 * V1_2_FeatureParamsChange: Transforms feature params between V0 and V1
 *
 * Applied when: targetVersion <= V1_Beta
 *
 * Breaking changes introduced in V1_2:
 *
 * 1. Type enum changes:
 *    - V0: Uses ApiFeatureType (static, boolean, single_use, continuous_use, credit_system)
 *    - V1: Uses FeatureType (boolean, metered, credit_system)
 *
 * 2. New fields in V1:
 *    - `consumable`: Required for metered features
 *    - `event_names`: Optional array of event names
 *
 * 3. Type mapping:
 *    - V0 single_use → V1 metered (consumable: true)
 *    - V0 continuous_use → V1 metered (consumable: false)
 *    - V0 static (legacy) → V1 boolean
 */

// Create Feature Change
export const V1_2_CreateFeatureChange = defineVersionChange({
	name: "V1_2 Create Feature Change",
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Feature type enum changed from ApiFeatureType to FeatureType",
		"Added consumable and event_names fields",
	],
	affectedResources: [AffectedResource.Feature],
	newSchema: CreateFeatureV1ParamsSchema,
	oldSchema: CreateFeatureV0ParamsSchema,
	affectsRequest: true,
	affectsResponse: false,

	// Request: V0 → V1 (old format to new)
	transformRequest: ({
		ctx: _ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof CreateFeatureV0ParamsSchema>;
	}): z.infer<typeof CreateFeatureV1ParamsSchema> => {
		const { type, consumable } = featureV0ToV1Type({ type: input.type });

		const result: z.infer<typeof CreateFeatureV1ParamsSchema> = {
			id: input.id,
			name: input.name ?? undefined,
			type,
			consumable,
			display: input.display
				? {
						singular: input.display.singular,
						plural: input.display.plural,
					}
				: undefined,
			credit_schema: input.credit_schema || undefined,
		};

		return result;
	},
});
