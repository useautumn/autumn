import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import type { ApiBalance } from "../../../customers/cusFeatures/apiBalance.js";
import { transformApiBalanceV1ToV0 } from "../../../customers/cusFeatures/changes/transformApiBalanceV1ToV0.js";
import { TrackLegacyDataSchema } from "../trackLegacyData.js";
import { TrackResponseV2Schema } from "../trackResponseV2.js";
import { TrackResponseV3Schema } from "../trackResponseV3.js";

export const V2_0_TrackChange = defineVersionChange({
	name: "V2_0 Track Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: ["Balance schema V1 to V0 transform"],
	affectedResources: [AffectedResource.Track],
	newSchema: TrackResponseV3Schema,
	oldSchema: TrackResponseV2Schema,
	legacyDataSchema: TrackLegacyDataSchema,
	affectsResponse: true,

	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof TrackResponseV3Schema>;
		legacyData?: z.infer<typeof TrackLegacyDataSchema>;
	}): z.infer<typeof TrackResponseV2Schema> => {
		let transformedBalances: Record<string, ApiBalance> | undefined;
		if (input.balances) {
			transformedBalances = {};
			for (const [featureId, balance] of Object.entries(input.balances)) {
				transformedBalances[featureId] = transformApiBalanceV1ToV0({
					input: balance,
					legacyData: legacyData?.balancesLegacyData?.[featureId],
				});
			}
		}

		return {
			customer_id: input.customer_id,
			entity_id: input.entity_id,
			event_name: input.event_name,
			value: input.value,
			balance: input.balance
				? transformApiBalanceV1ToV0({
						input: input.balance,
						legacyData: legacyData?.balanceLegacyData,
					})
				: null,
			balances: transformedBalances,
		};
	},
});
