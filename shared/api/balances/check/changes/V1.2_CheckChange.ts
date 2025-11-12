import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { transformBalanceToCusFeatureV3 } from "../../../customers/cusFeatures/changes/V1.2_CusFeatureChange.js";
import {
	type CheckLegacyData,
	CheckLegacyDataSchema,
} from "../checkLegacyData.js";
import { CheckResponseV2Schema } from "../checkResponseV2.js";
import { CheckResponseV1Schema } from "../prevVersions/CheckResponseV1.js";

/**
 * V1_2_CheckChange: Transforms check response TO V1_2 format
 *
 * Applied when: targetVersion <= V1_2
 *
 * Breaking changes introduced in V1_2 (that we reverse here):

 */

export const V1_2_CheckChange = defineVersionChange({
	name: "V1_2 Check Change",
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: ["Check response transformed to V2.0 format"],
	affectedResources: [AffectedResource.Check],
	newSchema: CheckResponseV2Schema,
	oldSchema: CheckResponseV1Schema,
	legacyDataSchema: CheckLegacyDataSchema,
	affectsResponse: true,

	// Response: V1.1+ (CheckResult) → V0_2 (CheckResponseV0)
	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof CheckResponseV2Schema>;
		legacyData?: CheckLegacyData;
	}): z.infer<typeof CheckResponseV1Schema> => {
		if (!legacyData) {
			throw new Error("Legacy data is required");
		}

		const { cusFeatureLegacyData, featureToUse } = legacyData;

		if (!input.balance) {
			return {
				allowed: false,
				code: "feature_found",
				customer_id: input.customer_id,
				feature_id: featureToUse.id,
				entity_id: input.entity_id,
				required_balance: input.required_balance,
			};
		}

		const cusFeatureV3 = transformBalanceToCusFeatureV3({
			input: input.balance,
			legacyData: cusFeatureLegacyData,
		});

		const baseData = {
			allowed: input.allowed,
			customer_id: input.customer_id,
			feature_id: featureToUse.id,
			entity_id: input.entity_id,
			required_balance: input.required_balance,
			code: "feature_found",
			...cusFeatureV3,
		};

		const { data, error } = CheckResponseV1Schema.safeParse(baseData);

		if (error) return baseData;

		return data;
	},
});
