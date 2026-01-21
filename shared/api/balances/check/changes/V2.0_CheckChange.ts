import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { transformApiBalanceV1ToV0 } from "../../../customers/cusFeatures/changes/transformApiBalanceV1ToV0.js";
import { CheckLegacyDataSchema } from "../checkLegacyData.js";
import { CheckResponseV2Schema } from "../checkResponseV2.js";
import { CheckResponseV3Schema } from "../checkResponseV3.js";

export const V2_0_CheckChange = defineVersionChange({
	name: "V2_0 Check Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: ["Balance schema V1 to V0 transform"],
	affectedResources: [AffectedResource.Check],
	newSchema: CheckResponseV3Schema,
	oldSchema: CheckResponseV2Schema,
	legacyDataSchema: CheckLegacyDataSchema,
	affectsResponse: true,

	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof CheckResponseV3Schema>;
		legacyData?: z.infer<typeof CheckLegacyDataSchema>;
	}): z.infer<typeof CheckResponseV2Schema> => {
		return {
			allowed: input.allowed,
			customer_id: input.customer_id,
			entity_id: input.entity_id,
			required_balance: input.required_balance,
			balance: input.balance
				? transformApiBalanceV1ToV0({
						input: input.balance,
						legacyData: legacyData?.cusFeatureLegacyData,
					})
				: null,
			preview: input.preview,
		};
	},
});
